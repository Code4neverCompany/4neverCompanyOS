@echo off
title 4neverCompanyOS
cd /d "%~dp0"
echo [%date% %time%] boot attempt >> server.log
where node >nul 2>nul
if errorlevel 1 (
  echo [%date% %time%] ERROR: Node.js not found on PATH >> server.log
  echo Node.js is not installed. Install it from https://nodejs.org then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install >> server.log 2>&1
)
echo Starting 4neverCompanyOS on http://localhost:4444 ...
start "" /min cmd /c "timeout /t 3 >nul && start "" http://localhost:4444"
node server.js >> server.log 2>&1
echo [%date% %time%] server exited >> server.log
pause
