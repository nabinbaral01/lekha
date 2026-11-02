@echo off
title Pathibhara Accounts - Stop
rem Stops the public share link (if any), the website (port 3000) and the database (port 5544).
taskkill /FI "WINDOWTITLE eq Pathibhara SHARE - close this window to stop sharing*" /T /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":5544 .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
echo Pathibhara Accounts stopped.
ping -n 4 127.0.0.1 >nul
