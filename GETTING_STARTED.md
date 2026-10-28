# 🚀 FieldWorker — Быстрый старт

## Вариант A: всё в Docker (как в проде)

```bash
docker-up.cmd        # = docker compose -f docker-compose.postgres.yml up -d --build
```

Поднимает PostgreSQL + Redis + API + worker + Telegram-бот. Миграции применяет
одноразовый сервис `migrate` до старта API.

- API / Swagger: **http://localhost:8001/docs**
- Портал: **http://localhost:8001/portal/**
- Остановка: `docker-down.cmd`, тесты в Docker: `docker-test.cmd`

## Вариант B: сервер на хосте (удобно для разработки)

### 1. База данных

```bash
docker compose -f docker-compose.postgres.yml up -d db
```

### 2. Окружение и зависимости

В проекте одно Python-окружение — `server/venv`:

```bash
make install-deps    # создаёт server/venv, ставит requirements.txt + requirements-dev.txt
```

Скопируйте `server/.env.example` → `server/.env` и раскомментируйте строку
`DATABASE_URL=postgresql+psycopg2://...@localhost:5432/fieldworker_db`.

### 3. Запуск

```bash
start_server.cmd     # или: make run-server
```

В режиме разработки сервер сам применяет миграции и создаёт тестовых
пользователей **admin/admin** и **user/user**. Чтобы работать на реальных
данных, загрузите снимок прода через `server/scripts/migrate_sqlite_to_postgres.py`.

### 4. Портал (Vite, hot reload)

```bash
cd portal
npm install
npm run dev          # http://localhost:3000/portal/  (проксирует /api → :8001)
```

---

## 📱 Android

1. Откройте проект в **Android Studio**
2. Запустите эмулятор
3. В настройках укажите сервер: `10.0.2.2:8001`
4. Войдите как `user/user`

---

## ⚙️ Основные команды (из корня)

```bash
make run-server     # Сервер на :8001
make test           # Тесты сервера (pytest)
make format         # black + isort
make clean          # Удалить сборки, кэши, скриншоты (scripts/clean.ps1)
make help           # Все команды
```

---

## 📚 Следующие шаги

| Документ | Описание |
|----------|----------|
| [README.md](README.md) | Полная документация |
| [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) | Push-уведомления |
| [deploy/wireguard/README.md](deploy/wireguard/README.md) | WireGuard для домофонов |
