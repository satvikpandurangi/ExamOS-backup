"""Enter a real dashboard-issued code in the visible agent; never grant monitoring consent."""
import importlib.util
import json
import os
from pathlib import Path
import queue
import sys
import threading
import time
import tkinter as tk

report_path=Path(os.environ['EXAMOS_ENROLLMENT_REPORT'])
os.environ['EXAMOS_CONFIG_PATH']=str(report_path.with_suffix('.device.dat'))
source=Path(os.environ.get('EXAMOS_AGENT_SOURCE','agent/agent.py')).resolve()
sys.path.insert(0,str(source.parent))
spec=importlib.util.spec_from_file_location('enrollment_agent_under_test',source)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
errors=[]
# Capture automated-test dialog results without changing the HTTP or Socket.IO operations.
module.messagebox.showerror=lambda title,message:errors.append(str(message))
root=tk.Tk()
agent=module.Agent(root)
root.title('ExamOS — Real enrollment verification')
agent.url.delete(0,'end')
agent.url.insert(0,os.environ['EXAMOS_TEST_URL'])
agent.name.delete(0,'end')
agent.name.insert(0,os.environ.get('EXAMOS_DEVICE_LABEL','Enrollment verification student'))
agent.code.insert(0,os.environ['EXAMOS_ENROLLMENT_CODE'])
jobs=queue.Queue()
report={}
def wait(predicate,timeout=15):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if predicate():return
        time.sleep(.05)
    raise RuntimeError('Enrollment verification timed out')
def run():
    try:
        jobs.put(agent.connect_button.invoke)
        baseline=os.environ.get('EXAMOS_EXPECT_BASELINE_FAILURE')=='1'
        if baseline:
            wait(lambda:bool(errors))
            report.update(firstError=errors[0],httpEnrollmentSucceeded=bool(agent.config),codeStillPresent=bool(agent.code.get()))
            jobs.put(agent.connect_button.invoke)
            wait(lambda:len(errors)>=2)
            report.update(retryError=errors[-1],connected=bool(agent.client and agent.client.connected))
            report['passed']=bool(report['httpEnrollmentSucceeded'] and report['codeStillPresent'] and not report['connected'] and '400' in report['retryError'])
        else:
            expected_failure=os.environ.get('EXAMOS_REJECT_FIRST_SOCKET')=='1'
            if expected_failure:
                wait(lambda:bool(errors))
                wait(lambda:not agent.code.get())
                report.update(phase='saved_after_connection_failure',codeClearedAfterFailedConnection=True,deviceId=agent.config['id'],firstError=errors[0])
                report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
                wait(lambda:Path(str(report_path)+'.retry').exists())
                jobs.put(agent.connect_button.invoke)
            wait(lambda:bool(agent.client and agent.client.connected))
            wait(lambda:not agent.code.get())
            wait(lambda:agent.connection_status.cget('text').startswith('Connected'))
            report.update(connected=True,deviceId=agent.config['id'],selectedTransport=agent.client.transport(),codeCleared=True,connectionLabel=agent.connection_status.cget('text'),monitoring=agent.gate.allowed())
            # Let the teacher's actual browser observe the connected enrolled device.
            time.sleep(3)
            jobs.put(agent.client.disconnect)
            wait(lambda:not agent.client.connected)
            wait(lambda:agent.connect_button.cget('state')=='normal')
            jobs.put(agent.connect_button.invoke)
            wait(lambda:agent.client.connected)
            report.update(reconnected=True,sameDeviceId=agent.config['id']==report['deviceId'])
            expected_errors=(len(errors)==1 and 'Device enrollment is saved' in errors[0]) if expected_failure else not errors
            report['passed']=bool(expected_errors and report['sameDeviceId'] and not agent.gate.allowed())
        report['errors']=errors
    except Exception as exc:
        report.update(passed=False,error=str(exc),errors=errors)
    finally:
        report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
        jobs.put(agent.close)
def poll():
    try:
        while True:jobs.get_nowait()()
    except queue.Empty:pass
    try:root.after(50,poll)
    except tk.TclError:pass
root.after(100,poll)
thread=threading.Thread(target=run,daemon=True)
thread.start()
root.mainloop()
thread.join(5)
if not report.get('passed'):raise SystemExit(1)
