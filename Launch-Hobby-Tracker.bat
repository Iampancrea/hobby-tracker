@echo off
setlocal
set "URL=https://iampancrea.github.io/hobby-tracker/"
set "DATA_DIR=%LOCALAPPDATA%\HobbyTrackerApp"

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%URL%" --user-data-dir="%DATA_DIR%"
    goto :done
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%URL%" --user-data-dir="%DATA_DIR%"
    goto :done
)

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%URL%" --user-data-dir="%DATA_DIR%"
    goto :done
)

if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%URL%" --user-data-dir="%DATA_DIR%"
    goto :done
)

start "" "%URL%"

:done
endlocal
