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

rem 设置环境变量
set NODE_ENV=production
set JWT_SECRET=weak-platform-jwt-secret-key-2026-very-long
set ENCRYPTION_KEY=encryption-key-for-data-32bytes-long

node server/index.js
pause
