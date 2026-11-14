@echo off
cd /d "%~dp0"
title CNMI NAP Queue
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1"
if errorlevel 1 (
  echo.
  echo The queue did not start.
  pause
)
