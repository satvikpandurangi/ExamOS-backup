@echo off
setlocal
cd /d "%~dp0"
if not exist data\tmp mkdir data\tmp
set "TEMP=%CD%\data\tmp"
set "TMP=%TEMP%"
if not exist node_modules (
  call npm ci --include=dev --no-audit --no-fund
  if errorlevel 1 goto failed
)
node scripts/setup-local.mjs
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
echo Dashboard: http://127.0.0.1:3000
echo Initial login: data\initial-login.txt
call npm run dev
exit /b %errorlevel%
:failed
echo ExamOS startup failed. See the error above.
pause
exit /b 1
