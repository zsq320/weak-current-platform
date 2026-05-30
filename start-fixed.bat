@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title Fixed Domain Mode

echo ========================================
echo   Fixed Domain Mode
echo ========================================
echo.

if not exist tunnel-name.txt (
    echo [Error] Tunnel not configured!
    echo Please run setup-tunnel.bat first.
    pause
    exit /b 1
)

echo Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing process on port 3000...
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 1 /nobreak >nul
)

echo [1/2] Building frontend...
cd client
call npx vite build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/2] Starting server...
echo.

node server/start-fixed.js
pause
