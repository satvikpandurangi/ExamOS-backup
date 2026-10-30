@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0ExamOS-Agent.exe" (
  echo ExamOS-Agent.exe is missing from this Student-Agent folder.
  echo Rebuild using agent\Build-Agent.ps1 in the ExamOS project.
  pause
  exit /b 1
)
start "" "%~dp0ExamOS-Agent.exe"
