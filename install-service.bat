@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Hobby Tracker - Windows Service Installer
echo ============================================
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires Administrator privileges.
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

:: Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "NODE_PATH="

:: Find node.exe
where node >nul 2>&1
if %errorLevel% equ 0 (
    set "NODE_PATH=node"
    echo Found node in PATH
) else (
    echo ERROR: node.js not found in PATH
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Set the full path to server.js
set "SERVER_JS=%SCRIPT_DIR%server.js"

:: Check if server.js exists
if not exist "%SERVER_JS%" (
    echo ERROR: server.js not found at %SERVER_JS%
    pause
    exit /b 1
)

echo.
echo This will install Hobby Tracker as a scheduled task that:
echo   - Starts automatically when Windows boots
echo   - Runs in the background without a visible window
echo   - Requires the PC to stay on (disable sleep)
echo.
echo Task name: HobbyTracker
echo Server file: %SERVER_JS%
echo.

set /p CONFIRM="Proceed with installation? (y/n): "
if /i not "%CONFIRM%"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.
echo Removing existing task if present...
schtasks /delete /tn "HobbyTracker" /f >nul 2>&1

echo Creating scheduled task...
schtasks /create ^
    /tn "HobbyTracker" ^
    /tr "\"%NODE_PATH%\" \"%SERVER_JS%\"" ^
    /sc onstart ^
    /ru SYSTEM ^
    /rl highest ^
    /f

if %errorLevel% equ 0 (
    echo.
    echo ============================================
    echo   SUCCESS: Hobby Tracker service installed!
    echo ============================================
    echo.
    echo The server will start automatically on boot.
    echo.
    echo To start it now:
    echo   schtasks /run /tn "HobbyTracker"
    echo.
    echo To stop it:
    echo   schtasks /end /tn "HobbyTracker"
    echo.
    echo To uninstall:
    echo   schtasks /delete /tn "HobbyTracker" /f
    echo.
    echo IMPORTANT: Keep your PC powered on and disable
    echo sleep mode for 24/7 operation:
    echo   Settings ^> System ^> Power ^& sleep ^> Never
    echo.
) else (
    echo.
    echo ERROR: Failed to create scheduled task.
    echo Check Windows Event Viewer for details.
)

pause
