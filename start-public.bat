@echo off
cd /d "%~dp0"
title Public Mode

echo ========================================
echo   Public Mode
echo ========================================
echo.

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

node server/start-public.js
pause
