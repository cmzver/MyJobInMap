# FieldWorker — Field Service Management System

[![CI](https://github.com/cmzver/MyJobInMap/actions/workflows/ci.yml/badge.svg)](https://github.com/cmzver/MyJobInMap/actions/workflows/ci.yml)

Система управления выездным обслуживанием. Состоит из четырёх компонентов:
Android-приложения для исполнителей, веб-портала для диспетчеров (React),
backend-сервера (FastAPI, порт 8001) и Telegram-бота.

| | |
|---|---|
| Статус | Production |
| Версия Android | 2.34.3 |
| Версия API | 2.18.0 |
| Тесты | 640+ |

---

## Стек технологий

| Слой | Технологии |
|------|-----------|
| Android (`app/`) | Kotlin, Jetpack Compose, Material 3, Hilt, Room (offline-first), Retrofit, OSMDroid, Coroutines/StateFlow, FCM push |
| Web Portal (`portal/`) | React 18, TypeScript 5, Vite 5, TailwindCSS, TanStack Query, Zustand, React Router 6, Leaflet |
| Backend (`server/`) | FastAPI, SQLAlchemy, Pydantic, Alembic, SQLite (опционально PostgreSQL), JWT, WebSocket, pytest |
| Bot (`bot/`) | Python, Telegram Bot API |

Экспериментальная переписка мобильного клиента на Kotlin Multiplatform
(`mobile-next/`) заархивирована и выведена из активной разработки. Снимок
сохранён в git-теге `archive/mobile-next-2026-06-04` и восстанавливается
командой `git checkout archive/mobile-next-2026-06-04 -- mobile-next`.

---

## Структура проекта

```
MyJobInMap/
├── app/            # Android-приложение (Kotlin, Jetpack Compose)
├── portal/         # React + TypeScript веб-портал
├── server/         # FastAPI backend (REST + WebSocket)
│   ├── app/        #   api / models / schemas / services
│   ├── alembic/    #   миграции БД
│   └── tests/      #   pytest (640+)
├── bot/            # Telegram-бот
├── scripts/        # Деплой и вспомогательные скрипты
├── monitoring/     # Prometheus / Grafana конфиги
├── docs/           # Документация
├── .github/        # CI (GitHub Actions)
└── docker-compose.*.yml, Makefile, Caddyfile
```

---

## Быстрый старт

### 1. Backend

```bash
cd server
pip install -r requirements.txt
make seed          # тестовые данные (admin/admin)
make run-server    # http://localhost:8001  (Swagger: /docs)
```

### 2. Web Portal

```bash
cd portal
npm install
npm run dev        # http://localhost:3000
```

Альтернативно — встроенный портал: http://localhost:8001/portal/

### 3. Android

```text
Android Studio → Open → MyJobInMap
Запуск на эмуляторе (сервер виден как 10.0.2.2:8001)
```

### 4. Тесты и проверки

```bash
cd server && make test     # pytest (640+)
cd portal && npm run build # tsc + vite build
```

CI (GitHub Actions) на каждый push в `main` выполняет: black + isort +
pytest (покрытие ≥ 50%) для сервера и tsc + build для портала.

---

## Возможности

- Заявки — карта с приоритет-маркерами, список, статусы (state machine), фото до/после, комментарии.
- Чат — групповые и личные чаты, реакции, упоминания, фото, прикрепление заявки карточкой с быстрым переходом к ней (portal и Android), realtime по WebSocket, push (FCM).
- Мультитенантность — изоляция данных по организациям, сценарии org-admin.
- SLA и аналитика — метрики, summary-эндпоинты, экспорт CSV.
- Offline-first — Android работает без сети, синхронизация при подключении.
- Обновления Android — публикация APK из админки, извлечение версии, ручная проверка.
- Безопасность — JWT, rate limiting (5/60s на login), role-based access.
- Резервное копирование — автоматические и ручные копии БД.

---

## Ключевые API-эндпоинты

Сервер: http://localhost:8001 · документация: /docs

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/login` | Вход (rate limit 5/60s) |
| GET | `/api/auth/me` | Текущий пользователь |
| GET / POST | `/api/tasks` | Список (пагинация) / создание заявки |
| PATCH | `/api/tasks/{id}/status` | Смена статуса (для `DONE`/`CANCELLED` требуется комментарий) |
| GET / POST | `/api/chat/conversations` | Чаты / создание |
| POST | `/api/chat/conversations/{id}/messages` | Сообщение (в т.ч. `task_id` — прикрепить заявку) |
| WS | `/ws?token=…` | Realtime-события чата и задач |
| GET | `/api/sla` | SLA и аналитика |
| GET / POST | `/api/admin/backup/*` | Резервное копирование |

---

## Команды (Makefile, из `server/`)

```bash
make run-server   # запуск сервера
make test         # тесты
make seed         # тестовые данные
make format       # black + isort
make help         # справка
```

---

## Документация

| Файл | Описание |
|------|----------|
| [GETTING_STARTED.md](GETTING_STARTED.md) | Быстрый старт |
| [CHANGELOG.md](CHANGELOG.md) | История версий |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Развёртывание |
| [docs/HTTPS_SETUP.md](docs/HTTPS_SETUP.md) | SSL-сертификаты |
| [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) | Push-уведомления |
| [docs/brain/README.md](docs/brain/README.md) | Knowledge vault (Obsidian) |

---

## Разработка

Добавить API-эндпоинт: роутер в `server/app/api/` → схема в
`server/app/schemas/` → регистрация в `server/app/api/__init__.py`.

Добавить страницу портала: компонент в `portal/src/pages/` → роут в
`portal/src/App.tsx` → пункт меню в `portal/src/config/menuConfig.ts`.

Обновить версию Android: `app/build.gradle.kts` → `versionCode` /
`versionName`, затем запись в `CHANGELOG.md`.

---

## Лицензия

MIT License

---

Последнее обновление: 18 июня 2026
