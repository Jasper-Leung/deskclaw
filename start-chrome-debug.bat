@echo off
echo ============================================
echo Starting Chrome with Remote Debugging
echo ============================================
echo.

REM Kill all existing Chrome processes
echo [1/3] Closing all Chrome windows...
taskkill /F /IM chrome.exe >nul 2>&1
echo Waiting 2 seconds...
ping 127.0.0.1 -n 3 >nul

REM Start Chrome with remote debugging using a temporary user data directory
echo [2/3] Starting Chrome with remote debugging on port 9222...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug-profile"

echo Waiting 5 seconds for Chrome to start...
ping 127.0.0.1 -n 6 >nul

echo [3/3] Testing connection to Chrome DevTools...
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json/version' -UseBasicParsing -TimeoutSec 5; if ($response.StatusCode -eq 200) { Write-Host 'SUCCESS: Chrome DevTools is available!' -ForegroundColor Green } else { Write-Host 'FAILED: Status code' $response.StatusCode -ForegroundColor Red } } catch { Write-Host 'FAILED: Cannot connect to Chrome DevTools' -ForegroundColor Red; Write-Host $_.Exception.Message -ForegroundColor Red }"

echo.
echo ============================================
echo Done!
echo ============================================
echo.
echo Next steps:
echo 1. If SUCCESS: You can now use the MCP browser control
echo 2. If FAILED: Check if port 9222 is blocked or Chrome didn't start
echo.
echo Manual test: Open browser and go to http://127.0.0.1:9222/json
echo.
pause
