$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force 'data/tmp' | Out-Null
$env:TEMP = Join-Path $PSScriptRoot 'data/tmp'
$env:TMP = $env:TEMP
if (!(Test-Path 'node_modules')) {
    npm ci --include=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed' }
}
node scripts/setup-local.mjs
if ($LASTEXITCODE -ne 0) { throw 'Database setup failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Dashboard build failed' }
Write-Host 'Dashboard: http://127.0.0.1:3000. Initial credentials: data/initial-login.txt'
npm run dev
