@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ======================================
echo    FieldWorker - Full stack in Docker (PostgreSQL)
echo  ======================================
echo.
echo  Building and starting: db + redis + api + worker ...
echo.

docker compose -f docker-compose.postgres.yml up -d --build
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
    echo.
    echo  [ERR] Failed to start ^(exit code %EXIT_CODE%^)
    exit /b %EXIT_CODE%
)

echo.
docker compose -f docker-compose.postgres.yml ps
echo.
echo  API    : http://localhost:8001/docs
echo  Portal : http://localhost:8001/portal
echo  Logs   : docker compose -f docker-compose.postgres.yml logs -f
echo  Stop   : docker-down.cmd
exit /b 0
