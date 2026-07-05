@echo off
REM ============================================================================
REM  Discord TTS (read-aloud) bot - Windows launcher (Requirement 11)
REM  Double-click this file to start the bot.
REM ============================================================================
setlocal enabledelayedexpansion

REM Req 11.1: always run from the application directory (this script's folder).
cd /d "%~dp0"

REM Req 11.2: check whether the Node.js runtime is available on the PATH.
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found on your PATH.
    echo Please install Node.js 18 or newer from https://nodejs.org/ and run this script again.
    echo Attempting to start anyway so Windows can report the exact error...
    echo.
    pause
)

REM Req 11.4: install dependencies before launching when they are missing.
if not exist "node_modules" (
    echo Installing dependencies. This can take a few minutes on the first run...
    call npm install
    if errorlevel 1 (
        echo [WARN] "npm install" failed. Retrying with --legacy-peer-deps...
        echo.
        call npm install --legacy-peer-deps
        if errorlevel 1 (
            echo [WARN] Dependency installation still reported an error. Attempting to start anyway...
            echo.
        )
    )
)

echo Starting the Discord TTS bot...
echo.
node src\index.js
set EXIT_CODE=!errorlevel!

REM Req 11.3: keep the console open and show the exit status on a non-zero exit.
if not "!EXIT_CODE!"=="0" (
    echo.
    echo The bot process exited with status !EXIT_CODE!.
    echo The window is kept open so you can read the messages above.
    pause
)

endlocal
