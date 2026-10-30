"""Launch the packaged UI without connecting or monitoring, then close owned processes."""
import os
from pathlib import Path
import subprocess
import time
import psutil

temporary = Path('data/tmp').resolve()
temporary.mkdir(parents=True, exist_ok=True)
environment = dict(os.environ, TEMP=str(temporary), TMP=str(temporary), EXAMOS_CONFIG_PATH=str(temporary/'exe-smoke-device.dat'))
process = subprocess.Popen([str(Path('Student-Agent/ExamOS-Agent.exe').resolve())], env=environment)
try:
    time.sleep(5)
    assert process.poll() is None, 'Packaged application exited during startup'
    print('Packaged agent remains running. Inspect the visible consent UI. Auto-closing in 45 seconds.', flush=True)
    time.sleep(45)
finally:
    try:
        children = psutil.Process(process.pid).children(recursive=True)
        for child in reversed(children):
            child.terminate()
        process.terminate()
        process.wait(timeout=10)
    except psutil.NoSuchProcess:
        pass
print('PASS: packaged executable startup smoke check. No connection or capture requested.')
