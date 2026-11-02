@echo off
title Pathibhara Accounts - Start
cd /d "%~dp0apps\server"

echo.
echo  Pathibhara Accounts - starting...
echo.

rem The website starts its own database (EMBEDDED_PG=1 in apps\server\.env): one window only.
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul
if errorlevel 1 (
  echo  Starting... keep the "Pathibhara Accounts - do not close" window open.
  start "Pathibhara Accounts - do not close" /min cmd /k "npm run start:dev"
) else (
  echo  Already running.
)

rem Wait until the website answers, then open the browser
echo  Waiting for the website...
for /l %%i in (1,1,60) do (
  curl -s -o nul http://localhost:3000/ && goto ready
  ping -n 3 127.0.0.1 >nul
)
echo  Website did not start. Check the "Pathibhara Accounts - do not close" window for errors.
pause
exit /b 1

:ready
echo.
echo  Ready:  http://localhost:3000
echo  Logins: admin / Admin12345   lekha / Lekha12345   auditor / Audit12345
start "" http://localhost:3000
ping -n 6 127.0.0.1 >nul
