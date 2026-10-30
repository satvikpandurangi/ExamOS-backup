"""Real visible Windows agent for the combined question-paper acceptance test."""
import json
import os
from pathlib import Path
import queue
import sys
import threading
import time
import tkinter as tk

os.environ['EXAMOS_CONFIG_PATH'] = str(Path('data/windows-exam-bridge-device.dat').resolve())
sys.path.insert(0, str(Path('agent').resolve()))
from agent import Agent

root = tk.Tk()
agent = Agent(root)
root.title('ExamOS — VISIBLE QUESTION PAPER INTEGRATION TEST')
root.lift()
root.focus_force()
agent.url.delete(0, 'end')
agent.url.insert(0, os.environ['EXAMOS_TEST_URL'])
agent.name.delete(0, 'end')
agent.name.insert(0, 'Windows examination student')
agent.code.insert(0, os.environ['EXAMOS_ENROLLMENT_CODE'])
commands = queue.Queue()
errors = []
def wait_for(predicate, label, timeout=20):
    deadline = time.monotonic()+timeout
    while time.monotonic()<deadline:
        if predicate():
            return
        time.sleep(.1)
    raise RuntimeError('Timed out: '+label)
def accept():
    root.lift()
    root.focus_force()
    agent.accept()
def workflow():
    try:
        commands.put(agent.connect)
        wait_for(lambda: agent.client and agent.client.connected and agent.gate.session, 'agent enrollment and active session')
        commands.put(accept)
        wait_for(agent.gate.allowed, 'visible consent')
        link = agent.create_examination_link()
        Path(os.environ['EXAMOS_LINK_REPORT']).write_text(json.dumps({'url':link}), encoding='utf-8')
        wait_for(lambda: agent.gate.session is None, 'teacher session end', timeout=60)
        assert not agent.gate.allowed()
        print('PASS: actual Windows agent enrolled, consented, created its device-bound examination link, and stopped at session end.', flush=True)
    except Exception as exc:
        errors.append(str(exc))
        print('FAIL:', exc, flush=True)
    finally:
        commands.put(agent.close)
def poll():
    try:
        while True:
            commands.get_nowait()()
    except queue.Empty:
        pass
    try:
        root.after(100,poll)
    except tk.TclError:
        pass
root.after(100,poll)
threading.Thread(target=workflow,daemon=True).start()
root.mainloop()
if errors:
    raise SystemExit(1)
