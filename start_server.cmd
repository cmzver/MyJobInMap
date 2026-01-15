@echo off
chcp 65001 >nul
cls
echo.
echo  ╔══════════════════════════════════════╗
echo  ║     FieldWorker API Server v2.3.0    ║
echo  ║     FastAPI + SQLite                 ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0server"

:: Проверка виртуального окружения
if exist "venv\Scripts\activate.bat" (
    echo  [OK] Python venv найден
    call venv\Scripts\activate.bat
) else (
    echo  [!] Python venv не найден!
    echo.
    echo  Создайте виртуальное окружение:
    echo    cd server
    echo    python -m venv venv
    echo    venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo.
echo  Запуск сервера...
echo  ────────────────────────────────────────
echo   URL:      http://localhost:8001
echo   Portal:   http://localhost:8001/portal
echo   API Docs: http://localhost:8001/docs
echo   Admin:    http://localhost:8001/admin
echo  ────────────────────────────────────────
echo.

python main.py

echo.
echo  Сервер остановлен.
pause
