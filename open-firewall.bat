@echo off
chcp 936 >nul 2>&1
echo Adding firewall rule (admin required)...
netsh advfirewall firewall add rule name="WeakCurrentPlatform" dir=in action=allow protocol=TCP localport=3000
if %errorlevel%==0 (
    echo.
    echo Success! Port 3000 is now open.
) else (
    echo.
    echo Failed! Please right-click and "Run as administrator".
)
pause
