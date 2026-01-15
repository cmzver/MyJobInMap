@echo off
chcp 65001 >nul
cls
cd /d "%~dp0portal"
echo.
echo  ╔══════════════════════════════════════╗
echo  ║     FieldWorker Portal               ║
echo  ║     React + Vite                     ║
echo  ╚══════════════════════════════════════╝
echo.

:: Проверка node_modules
if exist "node_modules" (
    echo  [OK] node_modules найден
) else (
    echo  [!] node_modules не найден!
    echo.
    echo  Установите зависимости:
    echo    cd portal
    echo    npm install
    echo.
    pause
    exit /b 1
)

echo.
echo  Запуск портала (dev mode)...
echo  ────────────────────────────────────────
echo   URL: http://localhost:5173
echo  ────────────────────────────────────────
echo.

npm run dev
