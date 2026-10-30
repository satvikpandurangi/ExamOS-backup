$ErrorActionPreference = 'Stop'
$modelDirectory = Join-Path $PSScriptRoot 'models'
$manifest = Get-Content -LiteralPath (Join-Path $modelDirectory 'MODEL.json') -Raw | ConvertFrom-Json
$modelPath = Join-Path $modelDirectory 'yolox.onnx'
if (!(Test-Path -LiteralPath $modelPath)) {
    New-Item -ItemType Directory -Force $modelDirectory | Out-Null
    Invoke-WebRequest -Uri $manifest.url -OutFile $modelPath
}
if ((Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256) {
    throw 'Camera model checksum mismatch. Existing file preserved; inspect it before rebuilding.'
}
Write-Host 'Verified offline camera model.'
