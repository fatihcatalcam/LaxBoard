@echo off
title LaxBoard

echo Clearing port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
  taskkill /PID %%a /F >nul 2>&1
)

echo Starting LaxBoard backend...
start "LaxBoard Backend" cmd /k "cd /d %~dp0 && npm run dev"

timeout /t 2 /nobreak >nul

echo Opening LaxBoard frontend...
start "" "%~dp0frontend\index.html"

echo Done. Backend running in a separate window.
