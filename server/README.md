# FieldWorker Backend

FastAPI-сервер: REST API, WebSocket, фоновые задачи (ARQ + Redis), PostgreSQL.
Порт 8001, Swagger — `/docs`. Версия API — `API_VERSION` в `app/config.py`.

## Запуск

Окружение одно — `server/venv`. Из корня репозитория:

```bash
docker compose -f docker-compose.postgres.yml up -d db   # PostgreSQL
make install-deps                                        # venv + requirements(-dev).txt
make migrate                                             # python -m app.migrate
make run-server                                          # uvicorn --reload на :8001
```

В Docker весь стек поднимает `docker-up.cmd`. Миграции там применяет одноразовый
сервис `migrate` до старта API и worker.

## Структура

```
server/
├── main.py              # Точка входа: приложение, middleware, lifespan, раздача портала
├── app/
│   ├── api/             # Роутеры по доменам: auth, tasks, addresses, chat, admin, analytics …
│   ├── models/          # SQLAlchemy 2 (Mapped[]), base.py — engine и run_migrations()
│   ├── schemas/         # Pydantic-схемы
│   ├── services/        # Бизнес-логика (роутеры остаются тонкими)
│   ├── utils/
│   ├── config.py        # Настройки (pydantic-settings, читаются из .env)
│   ├── migrate.py       # python -m app.migrate — одноразовое применение миграций
│   └── worker.py        # ARQ worker (push и другие фоновые задачи)
├── alembic/             # Миграции, см. MIGRATIONS.md
├── tests/               # pytest
└── scripts/             # dump_openapi.py, migrate_sqlite_to_postgres.py, seed_notifications.py
```

## Конфигурация

Шаблон — [.env.example](.env.example). В Docker `DATABASE_URL` задаётся compose-файлом.

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | PostgreSQL, локально `postgresql+psycopg2://fieldworker:fieldworker_secret@localhost:5432/fieldworker_db` |
| `SECRET_KEY` | Подпись JWT; в production дефолтное значение запрещено |
| `ENVIRONMENT` | `development` / `production`; в development создаются тестовые admin/admin и user/user |
| `RUN_MIGRATIONS_ON_STARTUP` | Применять миграции при старте API (по умолчанию нет) |
| `TASK_QUEUE_ENABLED`, `REDIS_URL` | Фоновая очередь ARQ |
| `FIREBASE_CREDENTIALS`, `VAPID_*` | Push: FCM и Web Push |
| `BACKUP_*`, `PG_DUMP_BIN`, `BACKUP_PG_DOCKER_CONTAINER` | Резервное копирование (pg_dump) |
| `TRUST_PROXY_HEADERS`, `RATE_LIMIT_*` | IP-guard и rate limiting за прокси |
| `BEWARD_*` | Домофоны Beward и on-demand WireGuard |

## Команды

Из корня (`Makefile`) или из `server/` (`server/Makefile`):

```bash
make test        # pytest
make lint        # pylint
make format      # black + isort (настройки в pyproject.toml, как в CI)
make migrate     # применить миграции
make run-server  # dev-сервер на :8001
```

После изменения API перегенерируйте типы клиентов: `npm run gen:api` в `portal/`
и `scripts/gen-android-models.ps1`.
