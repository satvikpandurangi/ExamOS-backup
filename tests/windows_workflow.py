"""Opt-in integration test. Opens the real visible agent and shares real previews locally.
Run from the project root against the running local server with initial-login.txt present.
No preview pixels are saved. Test exam history remains as an honest validation record.
"""
import base64
import io
import json
import os
from pathlib import Path
import queue
import sys
import threading
import time
import tkinter as tk
import requests
import socketio
from PIL import Image

os.environ['EXAMOS_CONFIG_PATH'] = str(Path('data/validation-device.dat').resolve())
sys.path.insert(0, str(Path('agent').resolve()))
from agent import Agent
import agent as student_module

# Instrument the real native capture/process calls; their actual results still flow to the server.
captures = []
application_queries = []
native_grab = student_module.MSS.grab
native_foreground_process = student_module.win32process.GetWindowThreadProcessId
def counted_grab(self, monitor):
    captures.append(time.monotonic())
    return native_grab(self, monitor)
def counted_foreground_process(window):
    application_queries.append(time.monotonic())
    return native_foreground_process(window)
student_module.MSS.grab = counted_grab
student_module.win32process.GetWindowThreadProcessId = counted_foreground_process

base = os.environ.get('EXAMOS_TEST_URL', 'http://127.0.0.1:3000')
login = json.loads(os.environ['EXAMOS_TEST_LOGIN']) if os.environ.get('EXAMOS_TEST_LOGIN') else dict(line.split(': ', 1) for line in Path('data/initial-login.txt').read_text().splitlines() if ': ' in line)
token = requests.post(base+'/api/login', json={'email': login['Email'], 'password': login['Password']}, timeout=5).json()['token']
headers = {'Authorization': 'Bearer '+token}
def api(path, payload=None):
    r = requests.request('POST' if payload is not None else 'GET', base+'/api'+path, json=payload, headers=headers, timeout=8)
    r.raise_for_status()
    return r.json()

assert not any(s['status'] == 'active' for s in api('/state')['sessions']), 'End the active examination before running validation'
code = api('/enrollment', {})['code']
root = tk.Tk()
agent = Agent(root)
root.title('ExamOS — VISIBLE LOCAL INTEGRATION TEST')
root.lift()
root.focus_force()
agent.url.delete(0, 'end')
agent.url.insert(0, base)
agent.name.delete(0, 'end')
agent.name.insert(0, 'Windows validation device')
agent.code.insert(0, code)
commands = queue.Queue()
frames = []
failures = []
stop_latencies = []
stop_notifications = []
teacher = socketio.Client(reconnection=False)
@teacher.on('monitoring-stopped')
def monitoring_stopped(data):
    stop_notifications.append(data)
@teacher.on('preview')
def preview(data):
    image = Image.open(io.BytesIO(base64.b64decode(data['jpeg'])))
    image.verify()
    frames.append((data['app'], time.monotonic()))

def wait_for(predicate, label, timeout=12):
    deadline = time.monotonic()+timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.1)
    raise AssertionError('Timed out: '+label)

def accept_on_visible_test_window():
    root.lift()
    root.focus_force()
    agent.accept_button.invoke()

def resume_sharing():
    wait_for(lambda: not agent.consent_pending, 'previous consent acknowledgment')
    wait_for(lambda: agent.accept_button.cget('state')=='normal' and agent.accept_button.cget('text')=='I consent — start sharing', 'initial consent control available')
    count = len(frames)
    commands.put(accept_on_visible_test_window)
    wait_for(lambda: len(frames) > count, 'sharing after explicit re-consent')

def stop_and_verify(trigger, reason):
    stopped = threading.Event()
    measurements = {}
    previous_notifications = len(stop_notifications)
    def perform_stop():
        started = time.monotonic()
        trigger()
        stop_latencies.append(time.monotonic()-started)
        measurements.update(captures=len(captures), applications=len(application_queries), allowed=agent.gate.allowed())
        stopped.set()
    commands.put(perform_stop)
    assert stopped.wait(5), 'Stop control blocked the UI'
    assert not measurements['allowed'], 'Capture still authorized when stop control returned'
    assert stop_latencies[-1] < .5, 'Local stop waited on network I/O'
    wait_for(lambda: len(stop_notifications) > previous_notifications, 'immediate teacher stop notification')
    assert reason in stop_notifications[-1]['reason']
    wait_for(lambda: not agent.consent_pending, 'withdrawal audit acknowledgment')
    state = api('/state')['devices']
    own = next(d for d in state if d['id']==agent.config['id'])
    assert own['online'] and not own['consented'] and own['app'] is None
    time.sleep(.3)
    count = len(frames)
    time.sleep(2.2)
    assert len(frames)==count, 'Preview transmitted after stopping'
    assert len(captures)==measurements['captures'], 'Native screen capture ran after stopping'
    assert len(application_queries)==measurements['applications'], 'Foreground application queried after stopping'
    events=api('/sessions/'+agent.gate.session['id']+'/events')
    assert any(e['kind']=='consent_withdrawn' and reason in e['detail'].get('reason','') for e in events)

def test_workflow():
    session = None
    try:
        teacher.connect(base, auth={'role': 'teacher', 'token': token})
        commands.put(agent.connect)
        wait_for(lambda: agent.client and agent.client.connected, 'agent enrollment and connection')
        assert Path(os.environ['EXAMOS_CONFIG_PATH']).exists(), 'DPAPI credential missing'
        assert not agent.gate.allowed()
        session = api('/sessions', {'name': 'Windows end-to-end validation', 'allowedApps': ['examos-validation.exe']})['id']
        wait_for(lambda: agent.gate.session and agent.gate.session['id'] == session, 'session notification')
        time.sleep(2.5)
        assert not frames, 'Screen sent before consent'
        assert not captures and not application_queries, 'Monitoring ran before initial consent'
        assert agent.accept_button.cget('text') == 'I consent — start sharing'
        assert root.bind('<Escape>'), 'Accessible keyboard stop shortcut missing'
        commands.put(accept_on_visible_test_window)
        wait_for(lambda: len(frames) >= 2, 'two real JPEG previews')
        assert agent.status.cget('text') == '● MONITORING ACTIVE'
        assert root.winfo_viewable() and root.attributes('-topmost'), 'Active monitoring indicator is not persistently visible'
        assert agent.accept_button.cget('text') == 'Stop monitoring (Esc)'
        assert frames[0][0].endswith('.exe'), 'Real executable name missing'
        events = api('/sessions/'+session+'/events')
        assert any(e['kind'] == 'rule_alert' for e in events)
        alert = next(e for e in events if e['kind'] == 'rule_alert')
        api('/events/'+alert['id']+'/review', {'review': 'Automated local validation: real foreground app observed; no misconduct finding.'})
        stop_and_verify(agent.accept_button.invoke, 'Student stopped monitoring')
        resume_sharing()
        stop_and_verify(lambda: root.event_generate('<Escape>'), 'using Escape')
        resume_sharing()
        def stop_at_lease_expiry():
            with agent.gate.lock:
                agent.gate.lease_until=time.monotonic()-1
            agent.accept_button.invoke()
        stop_and_verify(stop_at_lease_expiry, 'Student stopped monitoring')
        # Cancel an in-flight consent grant: a late acknowledgment must never restart capture.
        pending_cancelled = threading.Event()
        capture_count = len(captures)
        def cancel_pending_consent():
            agent.accept()
            agent.withdraw('keyboard_stop')
            pending_cancelled.set()
        commands.put(cancel_pending_consent)
        assert pending_cancelled.wait(5)
        wait_for(lambda: not agent.consent_pending, 'pending consent cancellation acknowledgment')
        time.sleep(2.2)
        assert not agent.gate.allowed() and len(captures)==capture_count
        resume_sharing()
        commands.put(root.iconify)
        wait_for(lambda: not agent.gate.allowed(), 'minimizing stops monitoring')
        wait_for(lambda: not agent.consent_pending, 'minimize audit acknowledgment')
        assert any('minimized' in p['reason'] for p in stop_notifications)
        count = len(captures)
        time.sleep(2.2)
        assert len(captures)==count, 'Capture continued while minimized'
        commands.put(root.deiconify)
        resume_sharing()
        api('/sessions/'+session+'/end', {})
        wait_for(lambda: not agent.gate.allowed() and agent.gate.session is None, 'stop on session end')
        time.sleep(.5)
        count = len(frames)
        time.sleep(3)
        assert len(frames) == count, 'Preview after session end'
        session = api('/sessions', {'name':'Close-window consent validation'})['id']
        wait_for(lambda: agent.gate.session and agent.gate.session['id']==session, 'new examination requires fresh consent')
        assert not agent.gate.allowed()
        resume_sharing()
        commands.put(agent.close)
        wait_for(lambda: any('closed' in p['reason'] for p in stop_notifications), 'closing records consent withdrawal before disconnect')
        wait_for(lambda: not agent.client.connected, 'closed window disconnects')
        close_history=api('/sessions/'+session+'/events')
        assert any(e['kind']=='consent_withdrawn' and 'closed' in e['detail'].get('reason','') for e in close_history)
        assert not agent.gate.allowed()
        print(json.dumps({'result':'PASS', 'real_jpeg_previews':len(frames), 'foreground_apps':sorted(set(f[0] for f in frames)), 'local_stop_seconds':stop_latencies, 'verified':['initial consent only','MONITORING ACTIVE indicator','single context-sensitive stop control','Escape stop','native capture and application queries cease on stop','teacher stop notification and audit','pending consent cannot restart capture','minimize stops monitoring','fresh explicit re-consent','DPAPI enrollment','real Windows screen and process','rule alert and review','session end stops capture','closing stops monitoring and records withdrawal']}, indent=2))
    except Exception as exc:
        failures.append(str(exc))
        print('FAIL:', exc)
        print('Gate:', agent.gate.accepted, agent.gate.allowed(), 'indicator:', agent.indicator_ready, 'connected:', bool(agent.client and agent.client.connected))
        if session:
            print('Recorded events:', [(e['kind'], e['detail']) for e in api('/sessions/'+session+'/events')])
    finally:
        if session:
            try:
                api('/sessions/'+session+'/end', {})
            except requests.HTTPError:
                pass
        if agent.config:
            api('/devices/'+agent.config['id']+'/revoke', {})
        teacher.disconnect()
        commands.put(agent.close)

def poll():
    try:
        while True:
            commands.get_nowait()()
    except queue.Empty:
        pass
    try:
        if root.winfo_exists():
            root.after(100, poll)
    except tk.TclError:
        pass

root.after(200, poll)
workflow=threading.Thread(target=test_workflow, daemon=True)
workflow.start()
root.mainloop()
workflow.join(timeout=15)
if failures:
    raise SystemExit(1)
