@echo off
setlocal

set SCRIPT_DIR=%~dp0

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\sync-update-server-preset.ps1"

if errorlevel 1 (
    echo.
    echo Deploy failed.
    pause
    exit /b 1
)

echo.
echo Deploy finished.
pause