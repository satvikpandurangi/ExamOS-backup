"""Validate the published artifact, rather than mistaking a TOC for an EXE."""
import hashlib
import json
from pathlib import Path
import struct
import sys

path = Path(sys.argv[1]).resolve(strict=True)
data = path.read_bytes()
assert path.suffix.lower() == '.exe', 'Expected a .exe file'
assert data[:2] == b'MZ', 'Missing DOS executable signature'
pe_offset = struct.unpack_from('<I', data, 0x3c)[0]
assert data[pe_offset:pe_offset+4] == b'PE\0\0', 'Missing Windows PE signature'
machine, sections = struct.unpack_from('<HH', data, pe_offset+4)
characteristics = struct.unpack_from('<H', data, pe_offset+22)[0]
magic = struct.unpack_from('<H', data, pe_offset+24)[0]
subsystem = struct.unpack_from('<H', data, pe_offset+24+68)[0]
assert machine == 0x8664 and magic == 0x20b, 'Expected a 64-bit Windows executable'
assert sections > 0 and characteristics & 2, 'PE is not marked executable'
assert not characteristics & 0x2000, 'Artifact is a DLL rather than an application'
assert subsystem == 2, 'Expected a Windows GUI application'
print(json.dumps({'path':str(path), 'bytes':len(data), 'format':'PE32+ x64 Windows GUI', 'sha256':hashlib.sha256(data).hexdigest()}, indent=2))
