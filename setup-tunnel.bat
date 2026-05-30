@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title Setup Cloudflare Tunnel

echo ========================================
echo   Setup Cloudflare Tunnel
echo ========================================
echo.
echo  Requires a Cloudflare account (free).
echo.
pause

echo.
echo Opening browser for authorization...
echo.

"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel login
if errorlevel 1 (
    echo Authorization failed!
    pause
    exit /b 1
)

echo.
echo Creating tunnel...
echo.
set /p TUNNEL_NAME="Enter tunnel name (english, e.g. my-platform): "

"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel create %TUNNEL_NAME%
if errorlevel 1 (
    echo Create tunnel failed!
    pause
    exit /b 1
)

echo.
echo Configuring DNS...
echo.
set /p SUBDOMAIN="Enter subdomain (e.g. app): "
set /p DOMAIN="Enter your domain (e.g. example.com): "

"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel route dns %TUNNEL_NAME% %SUBDOMAIN%.%DOMAIN%
if errorlevel 1 (
    echo DNS config failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo  URL: https://%SUBDOMAIN%.%DOMAIN%
echo  Tunnel: %TUNNEL_NAME%
echo.

echo %TUNNEL_NAME%> tunnel-name.txt
echo %SUBDOMAIN%.%DOMAIN%> tunnel-domain.txt
pause
