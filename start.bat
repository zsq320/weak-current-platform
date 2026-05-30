@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title Weak Current Platform

echo ========================================
echo   Starting Platform...
echo ========================================
echo.

echo Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing process on port 3000...
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 1 /nobreak >nul
)

echo Starting server...
echo.
node server/index.js
pause
