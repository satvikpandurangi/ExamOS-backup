"""Pre-publication checks; reports locations, never secret values. No third-party service."""
import json
from pathlib import Path
import re
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args])


paths = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').decode().split('\0')
paths = [p for p in paths if p]
known_secrets = []
# Compare against local secrets without printing them or sending them anywhere.
if Path('.env').exists():
    for line in Path('.env').read_text(encoding='utf8').splitlines():
        key, sep, value = line.partition('=')
        if sep and re.search(r'SECRET|PASSWORD|TOKEN|API_KEY', key, re.I) and len(value.strip()) >= 12:
            known_secrets.append(value.strip().strip('"\'' ).encode())
if Path('data/initial-login.txt').exists():
    for line in Path('data/initial-login.txt').read_text(encoding='utf8').splitlines():
        if line.startswith('Password: '):
            known_secrets.append(line.removeprefix('Password: ').encode())

patterns = {
    'private-key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'github-token': rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
    'aws-access-key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'literal-jwt': rb'\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}',
}
issues = []
total = 0
for path in paths:
    parts = Path(path).parts
    if any(p in ('data', 'artifacts', '.venv', 'node_modules', '__pycache__') for p in parts):
        issues.append((path, 'private/generated-directory'))
    if Path(path).name.startswith('.env') and not Path(path).name.endswith('.example'):
        issues.append((path, 'environment-file'))
    if Path(path).suffix.lower() in ('.exe', '.dll', '.dat', '.queue', '.receipt', '.db', '.sqlite', '.key', '.pem', '.webm', '.mp4', '.jpg', '.jpeg'):
        issues.append((path, 'binary/credential/evidence-file'))
    content = git('show', ':'+path)
    total += len(content)
    for value in known_secrets:
        if value and value in content:
            issues.append((path, 'matches-private-local-secret'))
    for name, pattern in patterns.items():
        if re.search(pattern, content):
            issues.append((path, name))
    if len(content) > 100*1024*1024:
        issues.append((path, 'exceeds-regular-Git-file-limit'))

required = ['agent/agent.py','agent/camera_monitor.py','agent/evidence_uploads.py','agent/event_clip.py',
            'server/proctoring.js','server/evidence.js','dashboard/src/main.jsx','dashboard/src/EvidenceCentre.jsx',
            'agent/ExamOS-Agent.spec','.env.example','README.md','ARCHITECTURE.md','CURRENT-VERIFICATION.md']
tracked = set(git('ls-files', '-z').decode().split('\0'))
for path in required:
    if path not in tracked:
        issues.append((path, 'missing-required-source'))
print(json.dumps({'staged_files':len(paths),'staged_bytes':total,'required_source_present':not any(i[1]=='missing-required-source' for i in issues),'issues':issues}, indent=2))
sys.exit(bool(issues))
