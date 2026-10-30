"""Opt-in visible hardware acceptance using the packaged application's actual controls."""
import json, os, queue, subprocess, sys, threading, time
from pathlib import Path

def run(root,agent,report_file):
    if os.environ.get('EXAMOS_CAMERA_TEST_APPROVED')!='visible-camera-snapshots-and-clips' or not os.environ.get('EXAMOS_CONFIG_PATH'):
        raise RuntimeError('Explicit webcam approval and isolated credentials required')
    root.title('ExamOS — USER-APPROVED REAL WEBCAM TEST (no audio)')
    agent.url.delete(0, 'end')
    agent.url.insert(0, os.environ['EXAMOS_TEST_URL'])
    agent.name.delete(0, 'end')
    agent.name.insert(0, 'Real webcam acceptance student')
    agent.code.insert(0, os.environ['EXAMOS_ENROLLMENT_CODE'])
    commands = queue.Queue()
    report = {'realHardware': True, 'explicitUserApproval': True, 'noAudio': True}
    errors = []
    report_path = Path(report_file)
    
    def publish():
        report['uploadReceipts']=list(agent.uploads.receipts.values())
        report['uploadStatus'],report['pendingUploads']=agent.uploads.status()
        report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    
    def wait_for(predicate, label, timeout=25):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(.1)
        raise RuntimeError('Timed out: ' + label)
    
    def start_camera():
        root.lift()
        agent.camera_consent.set(True)
        agent.snapshot_consent.set(True)
        agent.clip_consent.set(os.environ.get('EXAMOS_INCIDENT_TEST')=='1')
        agent.toggle_camera()
    
    def workflow():
        switch = None
        try:
            commands.put(agent.connect)
            wait_for(lambda: agent.client and agent.client.connected and agent.gate.session, 'real enrollment')
            assert not agent.camera.running()
            report['cameraOffBeforeConsent'] = True
            commands.put(agent.accept)
            wait_for(agent.gate.allowed, 'screen consent')
            report['url'] = agent.create_examination_link()
            publish()
            wait_for(lambda: agent.exam_state and agent.exam_state.get('status') == 'started', 'student start')
            commands.put(start_camera)
            wait_for(lambda: agent.camera.status == 'active' and agent.camera_preview.image is not None, 'real camera preview', 35)
            report['packaged']=bool(getattr(sys,'frozen',False))
            report['realCameraPreview'] = True
            report['cameraIndicator'] = agent.camera_status.cget('text').startswith('CAMERA ACTIVE')
            if os.environ.get('EXAMOS_INCIDENT_TEST')=='1':
                report['clipBufferExplicitlyConsented']=True
                publish()
                # The driver waits for an actual detector observation; no manual camera-check trigger.
                wait_for(lambda: agent.exam_state and agent.exam_state.get('status')=='submitted','real incident review and student submission',300)
                wait_for(lambda:not agent.camera.running() and not agent.gate.allowed(),'camera and screen stopped on submission')
                report['stoppedOnSubmission']=True
                report['passed']=True
                return
            agent.camera.check_requested.set()
            time.sleep(3)
            # Actual stop-button withdrawal releases the physical camera, then fresh consent is required.
            commands.put(agent.toggle_camera)
            wait_for(lambda: not agent.camera.running(), 'camera release on withdrawal')
            report['cameraReleasedOnWithdrawal'] = True
            # Exercise an actually unavailable camera index, not a fabricated network event.
            def unavailable_camera():
                agent.camera_consent.set(True)
                agent.snapshot_consent.set(False)
                agent.camera.start(agent.gate.session['id'], False, device_index=99)
            commands.put(unavailable_camera)
            wait_for(lambda: agent.camera.running(), 'unavailable camera attempt begins')
            wait_for(lambda: not agent.camera.running(), 'unavailable camera attempt released')
            wait_for(lambda: 'unavailable' in agent.camera_status.cget('text').lower(), 'visible camera unavailable warning')
            report['unavailableCameraWarning'] = True
            commands.put(start_camera)
            wait_for(lambda: agent.camera.status == 'active' and agent.camera_preview.image is not None, 'fresh consent camera restart')
            commands.put(agent.toggle_compact)
            wait_for(lambda: agent.compact_ui, 'compact monitoring panel')
            assert agent.gate.allowed() and agent.camera.permitted()
            assert agent.camera_indicator.winfo_ismapped() and agent.accept_button.winfo_ismapped()
            report['compactPanelPreservedConsentAndIndicators'] = True
            commands.put(agent.open_examination)
            wait_for(lambda: agent.environment.process is not None, 'actual Edge kiosk launch')
            edge_pid = agent.environment.process.pid
            report['limitedEdgeLaunched'] = True
            import win32gui
            import win32process
            wait_for(lambda: agent.environment.owns(win32process.GetWindowThreadProcessId(win32gui.GetForegroundWindow())[1]), 'actual Edge foreground readiness', 20)
            report['edgeForegroundReadyBeforeSwitch'] = True
            # A separate, clearly labelled test application really takes foreground focus.
            switch = subprocess.Popen([sys.executable, '-c',
                "import tkinter as t;r=t.Tk();r.title('ExamOS application-switch TEST');t.Label(r,text='Visible application switch test — closes automatically').pack(padx=30,pady=30);r.after(600,lambda:(r.lift(),r.focus_force()));r.after(7000,r.destroy);r.mainloop()"])
            wait_for(lambda: agent.last_switch > 0, 'real foreground application switch', 15)
            report['realApplicationSwitchObserved'] = True
            publish()
            wait_for(lambda: agent.exam_state and agent.exam_state.get('status') == 'submitted', 'student submission', 80)
            wait_for(lambda: not agent.camera.running() and not agent.gate.allowed() and agent.environment.process is None, 'all sensors and Edge stopped')
            import psutil
            wait_for(lambda: not psutil.pid_exists(edge_pid), 'owned Edge process exited')
            report['stoppedOnSubmission'] = True
            report['passed'] = True
            print('PASS: real camera preview, visible indicator, consent withdrawal/reopen, actual limited Edge kiosk, foreground switch and submission shutdown.', flush=True)
        except Exception as exc:
            errors.append(str(exc))
            report['passed'] = False
            report['error'] = str(exc)
            print('FAIL:', exc, flush=True)
        finally:
            publish()
            if switch and switch.poll() is None:
                switch.terminate()
            commands.put(agent.close)
    
    def poll():
        command_file=report_path.with_suffix('.command')
        if command_file.exists():
            command=command_file.read_text(encoding='utf8').strip()
            command_file.unlink()
            if command=='camera-check':
                agent.camera.request_check()
            elif command=='retry':
                agent.uploads.retry()
            elif command=='reconnect':
                agent.connect()
                def reconsent():
                    if agent.client and agent.client.connected and agent.gate.session and not agent.camera.running():
                        agent.accept()
                        start_camera()
                        agent.uploads.retry()
                    else:
                        root.after(500,reconsent)
                root.after(1000,reconsent)
        try:
            while True:
                commands.get_nowait()()
        except queue.Empty:
            pass
        root.after(100, poll)
    
    root.after(100, poll)
    threading.Thread(target=workflow, daemon=True).start()
