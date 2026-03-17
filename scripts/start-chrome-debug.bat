@echo off
echo ========================================
echo Starting Chrome with Remote Debugging
echo ========================================
echo.

REM Kill all existing Chrome processes
echo Closing all Chrome processes...
taskkill /F /IM chrome.exe 2>nul
taskkill /F /IM chrome-debug.exe 2>nul
timeout /t 2 /nobreak >nul

REM Start Chrome with remote debugging enabled
echo Starting Chrome with remote debugging on port 9222...
echo.

REM Get Chrome path
set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" set CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" (
    echo ERROR: Chrome not found at default locations
    echo Please update CHROME_PATH in this script
    pause
    exit /b 1
)

REM Start Chrome with remote debugging
start "" "%CHROME_PATH%" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug" http://localhost:3001/

echo.
echo Chrome is starting with remote debugging enabled...
echo.
echo You can verify the connection by running:
echo   npm run chrome:check
echo.
pause
