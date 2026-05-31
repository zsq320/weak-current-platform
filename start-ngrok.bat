@echo off
cd /d "%~dp0"
title Ngrok Mode

echo ========================================
echo   Ngrok Mode
echo ========================================
echo.

if not exist ngrok-token.txt (
    echo [Error] ngrok not configured!
    echo Please run setup-ngrok.bat first.
    pause
    exit /b 1
)

echo Stopping any process on port 3000...
for /f "tokens=1-5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [1/2] Building frontend...
cd /d "%~dp0client"
call npx vite build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
cd /d "%~dp0"

echo.
echo [2/2] Starting server and ngrok...
echo.

set NODE_ENV=production
set JWT_SECRET=weak-platform-jwt-secret-key-2026-very-long
set ENCRYPTION_KEY=encryption-key-for-data-32bytes-long

node server/start-ngrok.js
pause
