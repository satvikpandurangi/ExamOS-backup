param([switch]$CheckOnly,[switch]$Background)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$portNumber=3000
if(Test-Path -LiteralPath '.env'){
    $portLine=Get-Content -LiteralPath '.env' | Where-Object {$_ -match '^PORT=(\d+)$'} | Select-Object -First 1
    if($portLine){$portNumber=[int]($portLine -replace '^PORT=','')}
}
$listener=Get-NetTCPConnection -LocalPort $portNumber -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if($listener){
    $serviceProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if($serviceProcess.Name -ne 'node.exe' -or $serviceProcess.CommandLine -notmatch 'server[/\\]index.js'){throw 'The listening process is not the expected ExamOS Node server. No process was stopped.'}
    node scripts/check-restart.mjs
    if($LASTEXITCODE -ne 0){throw 'Restart preflight failed. No process was stopped.'}
    if($CheckOnly){Write-Host 'Check only: the server was not stopped.';return}
    Stop-Process -Id $listener.OwningProcess
    if(Test-Path -LiteralPath 'data/postgres'){
        $backupPath=Join-Path $PSScriptRoot ('data/backups/pre-restart-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'data/postgres') -Destination $backupPath -Recurse
    }
}elseif($CheckOnly){Write-Host 'No local server is listening.';return}
if($Background){
    npm run build
    if($LASTEXITCODE -ne 0){throw 'Dashboard build failed; database backup is retained.'}
    $started=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('server/index.js') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/vision-server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/vision-server-errors.log') -PassThru
    Write-Host "ExamOS server started with process ID $($started.Id)."
}else{
    & (Join-Path $PSScriptRoot 'Start-ExamOS.ps1')
}
