# Local Development

Пошаговая инструкция — [GETTING_STARTED.md](../../GETTING_STARTED.md). Кратко:

- Python-окружение одно: `server/venv` (`make install-deps`).
- БД — PostgreSQL из `docker-compose.postgres.yml` (`... up -d db`), затем `make migrate`.
- Сервер — `make run-server` или `start_server.cmd` (:8001), портал — `npm run dev` (:3000/portal/).
- Android-эмулятор видит сервер как `10.0.2.2:8001`.
- Мусор (сборки, кэши, скриншоты) — `make clean`.
