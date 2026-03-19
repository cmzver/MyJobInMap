@echo off
setlocal

set SCRIPT_DIR=%~dp0
set MODE=%~1

if "%MODE%"=="" (
    powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\sync-update-server-preset.ps1"
) else (
    powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\sync-update-server-preset.ps1" -Mode %MODE%
)

if errorlevel 1 (
    echo.
    echo Deploy failed.
    pause
    exit /b 1
)

echo.
echo Deploy finished.
pause