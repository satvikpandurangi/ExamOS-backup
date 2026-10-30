$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
Set-Location $projectDirectory
$pythonExecutable = Join-Path $projectDirectory '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $pythonExecutable)) { throw 'Create the project Python .venv before building the agent.' }
$buildId = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$buildDirectory = Join-Path $projectDirectory "data/agent-builds/$buildId"
$stagingDirectory = Join-Path $buildDirectory 'dist'
$finalDirectory = Join-Path $projectDirectory 'Student-Agent'
$finalExecutable = Join-Path $finalDirectory 'ExamOS-Agent.exe'
New-Item -ItemType Directory -Force $buildDirectory, $stagingDirectory, $finalDirectory, 'data/tmp' | Out-Null
$env:TEMP = Join-Path $projectDirectory 'data/tmp'
$env:TMP = $env:TEMP
$env:PYINSTALLER_CONFIG_DIR = Join-Path $projectDirectory 'data/pyinstaller-cache'
& $pythonExecutable -m pip install -r (Join-Path $PSScriptRoot 'requirements-lock.txt')
if ($LASTEXITCODE -ne 0) { throw 'Agent runtime dependency installation failed' }
& (Join-Path $PSScriptRoot 'Prepare-Camera-Model.ps1')
& $pythonExecutable -m pip install 'pyinstaller==6.22.3'
if ($LASTEXITCODE -ne 0) { throw 'Packaging dependency installation failed' }
& $pythonExecutable -m PyInstaller --noconfirm --distpath $stagingDirectory --workpath (Join-Path $buildDirectory 'work') (Join-Path $PSScriptRoot 'ExamOS-Agent.spec')
if ($LASTEXITCODE -ne 0) { throw 'Agent build failed' }
$stagedExecutable = Join-Path $stagingDirectory 'ExamOS-Agent.exe'
& $pythonExecutable (Join-Path $projectDirectory 'scripts/verify-agent-exe.py') $stagedExecutable
if ($LASTEXITCODE -ne 0) { throw 'Built artifact is not a valid Windows GUI executable' }
$reportPath = Join-Path $buildDirectory 'enrollment-ui.json'
$previousConfigPath = $env:EXAMOS_CONFIG_PATH
try {
    # Isolate the test from the student's real saved credential. No enrollment or capture occurs.
    $env:EXAMOS_CONFIG_PATH = Join-Path $buildDirectory 'unused-test-device.dat'
    $verificationProcess = Start-Process -FilePath $stagedExecutable -ArgumentList @('--verify-ui', ('"' + $reportPath + '"')) -PassThru -WindowStyle Normal
    if (!$verificationProcess.WaitForExit(20000)) { throw 'Packaged enrollment UI verification timed out' }
    if ($verificationProcess.ExitCode -ne 0 -or !(Test-Path -LiteralPath $reportPath)) { throw 'Packaged agent failed to start or produce its verification report' }
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    if (!$report.passed -or !$report.packaged) { throw "Packaged enrollment UI validation failed: $reportPath" }
} finally { $env:EXAMOS_CONFIG_PATH = $previousConfigPath }
if (Test-Path -LiteralPath $finalExecutable) {
    Copy-Item -LiteralPath $finalExecutable -Destination (Join-Path $buildDirectory 'previous-ExamOS-Agent.exe')
}
try {
    Copy-Item -LiteralPath $stagedExecutable -Destination $finalExecutable -Force
} catch {
    # Windows locks a running image against overwrite. Preserve it without terminating it.
    $previousRunningExecutable = Join-Path $buildDirectory 'previous-running-ExamOS-Agent.exe'
    $workspacePrefix = [IO.Path]::GetFullPath($projectDirectory) + [IO.Path]::DirectorySeparatorChar
    foreach ($checkedPath in @($finalExecutable, $previousRunningExecutable)) {
        if (![IO.Path]::GetFullPath($checkedPath).StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing to move an executable outside the project directory'
        }
    }
    Move-Item -LiteralPath $finalExecutable -Destination $previousRunningExecutable
    Copy-Item -LiteralPath $stagedExecutable -Destination $finalExecutable
    Write-Host "Preserved the previously running executable at: $previousRunningExecutable"
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Launch-Student-Agent.template.cmd') -Destination (Join-Path $finalDirectory 'Launch-Student-Agent.cmd') -Force
# Check and launch the published file, not merely the staging output.
$publishedPeReport = & $pythonExecutable (Join-Path $projectDirectory 'scripts/verify-agent-exe.py') $finalExecutable
if ($LASTEXITCODE -ne 0) { throw 'Published EXE verification failed' }
$publishedPeReport | Set-Content -LiteralPath (Join-Path $buildDirectory 'published-executable.json') -Encoding utf8
$publishedUiReport = Join-Path $buildDirectory 'published-enrollment-ui.json'
try {
    $env:EXAMOS_CONFIG_PATH = Join-Path $buildDirectory 'unused-test-device.dat'
    $publishedProcess = Start-Process -FilePath $finalExecutable -WorkingDirectory $finalDirectory -ArgumentList @('--verify-ui', ('"' + $publishedUiReport + '"')) -PassThru -WindowStyle Normal
    if (!$publishedProcess.WaitForExit(20000)) { throw 'Published EXE launch verification timed out' }
    if ($publishedProcess.ExitCode -ne 0 -or !(Test-Path -LiteralPath $publishedUiReport)) { throw 'Published EXE failed to launch' }
    $publishedReport = Get-Content -LiteralPath $publishedUiReport -Raw | ConvertFrom-Json
    if (!$publishedReport.passed -or !$publishedReport.packaged) { throw 'Published EXE enrollment UI checks failed' }
} finally { $env:EXAMOS_CONFIG_PATH = $previousConfigPath }
Copy-Item -LiteralPath (Join-Path $buildDirectory 'published-executable.json') -Destination (Join-Path $projectDirectory 'artifacts/agent-executable.json') -Force
Copy-Item -LiteralPath $publishedUiReport -Destination (Join-Path $projectDirectory 'artifacts/agent-enrollment-ui.json') -Force
Write-Host "VERIFIED EXE: $finalExecutable"
Write-Host "Enrollment UI verification report: $reportPath"
