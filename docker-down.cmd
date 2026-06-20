@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo  Stopping FieldWorker Docker stack...
docker compose -f docker-compose.postgres.yml down
echo  Done. ^(Данные БД сохранены в volume postgres_data; для полной очистки: docker compose -f docker-compose.postgres.yml down -v^)
exit /b %ERRORLEVEL%
