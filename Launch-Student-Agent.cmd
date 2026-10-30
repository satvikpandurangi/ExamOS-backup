@echo off
setlocal
if not exist "%~dp0Student-Agent\ExamOS-Agent.exe" (
  echo ExamOS-Agent.exe is missing. Run agent\Build-Agent.ps1 to rebuild it.
  pause
  exit /b 1
)
start "" "%~dp0Student-Agent\ExamOS-Agent.exe"
