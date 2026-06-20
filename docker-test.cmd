@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ======================================
echo    FieldWorker - Tests in Docker (PostgreSQL)
echo  ======================================
echo.

docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
set EXIT_CODE=%ERRORLEVEL%

echo.
echo  Cleaning up test containers...
docker compose -f docker-compose.test.yml down -v >nul 2>&1

echo.
if "%EXIT_CODE%"=="0" (
    echo  [OK] Tests PASSED
) else (
    echo  [ERR] Tests FAILED ^(exit code %EXIT_CODE%^)
)
exit /b %EXIT_CODE%
