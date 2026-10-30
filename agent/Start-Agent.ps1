$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force 'data/tmp' | Out-Null
$env:TEMP = Join-Path (Get-Location) 'data/tmp'
$env:TMP = $env:TEMP
if (!(Test-Path '.venv/Scripts/python.exe')) {
    py -3.13 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.13 with Tk is required' }
}
& '.venv/Scripts/python.exe' -m pip install -r agent/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Agent dependency installation failed' }
& (Join-Path $PSScriptRoot 'Prepare-Camera-Model.ps1')
& '.venv/Scripts/python.exe' agent/agent.py
