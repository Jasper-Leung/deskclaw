@echo off
REM DeskClaw Portable Build Script for Windows

echo.
echo ============================================
echo    DeskClaw Portable Build Script
echo ============================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Display Node.js version
echo Node.js version:
node -v
echo.

REM Display npm version
echo npm version:
npm -v
echo.

echo Starting build process...
echo.

REM Run the build script
node scripts\build-portable.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Build failed! Please check the error messages above.
    pause
    exit /b 1
)

echo.
echo Build completed successfully!
echo.
echo Portable executable is located in: release\
echo.
pause
