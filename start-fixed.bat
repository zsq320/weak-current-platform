@echo off
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

echo.
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

set NODE_ENV=production
set JWT_SECRET=weak-platform-jwt-secret-key-2026-very-long
set ENCRYPTION_KEY=encryption-key-for-data-32bytes-long

node server/start-fixed.js
pause
