@echo off
chcp 65001 >nul
cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║        FieldWorker v2.3.0 - Запуск сервисов          ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║  1. API Server (FastAPI)      - порт 8001            ║
echo  ║  2. Portal (React dev)        - порт 5173            ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: Запуск API сервера
echo  [1/2] Запуск API сервера...
start "FieldWorker Server" cmd /k "%~dp0start_server.cmd"
timeout /t 3 /nobreak >nul

:: Запуск Portal (только dev режим)
echo  [2/2] Запуск веб-портала (dev)...
start "FieldWorker Portal" cmd /k "%~dp0start_portal.cmd"
timeout /t 2 /nobreak >nul

echo.
echo  ════════════════════════════════════════
echo   Все сервисы запущены!
echo  ════════════════════════════════════════
echo.
echo   API Server:  http://localhost:8001
echo   API Docs:    http://localhost:8001/docs
echo   Portal:      http://localhost:8001/portal (production)
echo   Portal:      http://localhost:5173 (dev mode)
echo.
echo   Для Android эмулятора: 10.0.2.2:8001
echo.
pause
