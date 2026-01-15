@echo off
chcp 65001 >nul
cls
echo.
echo  ╔══════════════════════════════════════╗
echo  ║     FieldWorker Telegram Bot         ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0bot"

:: Проверка виртуального окружения
if exist "..\server\venv\Scripts\activate.bat" (
    echo  [OK] Python venv найден
    call ..\server\venv\Scripts\activate.bat
) else (
    echo  [!] Python venv не найден!
    echo  Убедитесь, что server\venv существует
    pause
    exit /b 1
)

:: Проверка .env файла
if exist ".env" (
    echo  [OK] Конфигурация .env найдена
) else (
    echo  [!] Файл .env не найден!
    echo  Создайте bot\.env с токеном бота
    pause
    exit /b 1
)

echo.
echo  Запуск Telegram бота...
echo  ────────────────────────────────────────
echo.

python bot.py

echo.
echo  Бот остановлен.
pause
