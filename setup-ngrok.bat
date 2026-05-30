@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title Setup Ngrok

echo ========================================
echo   Setup Ngrok
echo ========================================
echo.
echo  1. Sign up at https://dashboard.ngrok.com/signup
echo  2. Get token at https://dashboard.ngrok.com/get-started/your-authtoken
echo  3. Get domain at https://dashboard.ngrok.com/domains
echo.

set /p AUTH_TOKEN="Enter your Authtoken: "
if "%AUTH_TOKEN%"=="" (
    echo Token cannot be empty!
    pause
    exit /b 1
)

set /p DOMAIN="Enter your domain (e.g. xxx.ngrok-free.app): "
if "%DOMAIN%"=="" (
    echo Domain cannot be empty!
    pause
    exit /b 1
)

echo %AUTH_TOKEN%> ngrok-token.txt
echo %DOMAIN%> ngrok-domain.txt

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo  URL: https://%DOMAIN%
echo.
pause
