@echo off
setlocal
chcp 65001 >nul
echo.
echo  ======================================
echo    FieldWorker API Server
echo  ======================================
echo.

cd /d "%~dp0server"

:: Проверка виртуального окружения
if exist "venv\Scripts\activate.bat" (
    echo  [OK] Python environment
    call venv\Scripts\activate.bat
) else (
    echo  [ERR] Python environment not found
    echo.
    echo  Setup:
    echo    cd server
    echo    python -m venv venv
    echo    venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

if not exist "run_no_reload.py" (
    echo.
    echo  [ERR] Entry point not found: run_no_reload.py
    pause
    exit /b 1
)

set SERVER_PID=
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":8001 .*LISTENING"') do (
    if not defined SERVER_PID set SERVER_PID=%%P
)

if defined SERVER_PID (
    echo.
    echo  [INFO] Server is already running on port 8001
    echo  PID       : %SERVER_PID%
    echo  API       : http://localhost:8001/docs
    echo  Portal    : http://localhost:8001/portal
    exit /b 0
)

echo.
echo  Starting server...
echo  API       : http://localhost:8001/docs
echo  Portal    : http://localhost:8001/portal
echo.

c:\Users\VADIM\Documents\MyJobInMap\server\venv\Scripts\python.exe run_no_reload.py

set EXIT_CODE=%ERRORLEVEL%

echo.
if "%EXIT_CODE%"=="0" (
    echo  Server stopped.
) else (
    echo  [ERR] Server stopped with code %EXIT_CODE%
    pause
)

exit /b %EXIT_CODE%
