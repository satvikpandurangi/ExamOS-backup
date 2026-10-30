# Reproducible Windows one-file build. Paths are relative to this tracked spec.
from pathlib import Path

agent_directory = Path(SPECPATH).resolve()
a = Analysis(
    [str(agent_directory / 'agent.py')],
    pathex=[str(agent_directory)],
    binaries=[],
    datas=[(str(agent_directory / 'models' / 'yolox.onnx'), 'models'),
           (str(agent_directory / 'models' / 'LICENSE-YOLOX.txt'), 'models')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='ExamOS-Agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)
