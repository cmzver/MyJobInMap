# Миграции БД (Alembic)

Схема БД меняется только через миграции в `alembic/versions/`. URL базы Alembic
берёт из настроек приложения (`DATABASE_URL`), а не из `alembic.ini`.

## Применение

| Где | Как |
|-----|-----|
| Локально | `make migrate` (= `python -m app.migrate` из `server/`) |
| Docker / прод | Одноразовый сервис `migrate` в `docker-compose.postgres.yml` выполняется до старта API и worker |
| При старте API | Только если `RUN_MIGRATIONS_ON_STARTUP=true`; по умолчанию выключено |

`python -m app.migrate` при ошибке завершается с ненулевым кодом, и API в Docker не стартует.

## Новая миграция

1. Измените модель в `app/models/`.
2. Сгенерируйте миграцию:
   ```bash
   cd server
   venv\Scripts\alembic revision --autogenerate -m "add tasks.created_by_id"
   ```
3. Проверьте файл в `alembic/versions/` вручную: autogenerate пропускает переименования,
   серверные дефолты и изменения типов.
4. Имя файла — `ГГГГММДД_NNNN_описание.py`, как у существующих.
5. Примените (`make migrate`) и запустите тесты. CI прогоняет их на SQLite и PostgreSQL,
   поэтому для операций, которых нет в SQLite, используйте `op.batch_alter_table()`.

## Статус и откат

```bash
cd server
venv\Scripts\alembic current
venv\Scripts\alembic history
venv\Scripts\alembic downgrade -1
```

Перед откатом или рискованной миграцией на проде сделайте бэкап («Резервные копии» в системных настройках портала)
и убедитесь, что из него можно восстановиться.
