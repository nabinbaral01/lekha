@echo off
title Pathibhara Accounts - Share
rem Shares the running site over the internet through a temporary Cloudflare link (https://....trycloudflare.com).
rem Anyone with the link can open the LOGIN page. Change the demo passwords before sharing.
setlocal
set "CF=C:\Program Files (x86)\cloudflared\cloudflared.exe"
set "LOG=%TEMP%\pathibhara-share.log"

if not exist "%CF%" (
  echo  cloudflared is not installed at "%CF%".
  pause
  exit /b 1
)

rem 1. Make sure the site itself is running (start.bat skips anything already running).
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul
if errorlevel 1 call "%~dp0start.bat"

rem 2. Stop an earlier share window, if any, then open a new tunnel.
taskkill /FI "WINDOWTITLE eq Pathibhara SHARE - close this window to stop sharing*" /T /F >nul 2>&1
if exist "%LOG%" del "%LOG%"
echo.
echo  Opening a public link... (this takes 5-20 seconds)
start "Pathibhara SHARE - close this window to stop sharing" /min "%CF%" tunnel --no-autoupdate --url http://localhost:3000 --logfile "%LOG%"

rem 3. Wait for the link to appear in the log, then show it and copy it to the clipboard.
set "URL="
for /l %%i in (1,1,30) do (
  if not defined URL (
    ping -n 3 127.0.0.1 >nul
    for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command "if (Test-Path $env:LOG) { (Select-String -Path $env:LOG -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1).Matches.Value }"`) do set "URL=%%u"
  )
)

if not defined URL (
  echo.
  echo  Could not get a link. Check the internet connection and try again.
  echo  Details are in: %LOG%
  pause
  exit /b 1
)

echo %URL%| clip
echo.
echo  ================================================================
echo   SHARE THIS LINK:   %URL%
echo   (already copied - paste it in Viber / Messenger / email)
echo  ================================================================
echo.
echo   - Keep this PC on and connected to the internet.
echo   - The link works until you run stop.bat or close the
echo     "Pathibhara SHARE" window. A new link is made each time.
echo   - Give friends an AUDITOR (view-only) login, not admin.
echo.
start "" %URL%
pause
