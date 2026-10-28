# FieldWorker — Field Service Management System

[![Server CI](https://github.com/cmzver/MyJobInMap/actions/workflows/ci-server.yml/badge.svg)](https://github.com/cmzver/MyJobInMap/actions/workflows/ci-server.yml)
[![Portal CI](https://github.com/cmzver/MyJobInMap/actions/workflows/ci-portal.yml/badge.svg)](https://github.com/cmzver/MyJobInMap/actions/workflows/ci-portal.yml)

Система управления выездным обслуживанием: Android-приложение для исполнителей,
веб-портал для диспетчеров и администраторов, backend на FastAPI и Telegram-бот.

| | |
|---|---|
| Статус | Production (PostgreSQL, Docker) |
| Версия Android | 2.36.1 — `app/build.gradle.kts` |
| Версия API | 2.18.0 — `server/app/config.py` |
| Тесты | сервер 825 · портал 73 · Android 106 |

---

## Стек

| Слой | Технологии |
|------|-----------|
| Android (`app/`) | Kotlin, Jetpack Compose, Material 3, Hilt, Room (offline-first, outbox), Retrofit + kotlinx.serialization (модели из OpenAPI), OSMDroid, FCM |
| Портал (`portal/`) | React 18, TypeScript 5, Vite 5, TailwindCSS, TanStack Query, Zustand, React Router 6, Leaflet; типы из OpenAPI |
| Backend (`server/`) | FastAPI, SQLAlchemy 2, Pydantic 2, Alembic, PostgreSQL 15, Redis + ARQ (фоновые задачи), JWT, WebSocket, pytest |
| Бот (`bot/`) | Python, python-telegram-bot |
| Инфраструктура | Docker Compose, Caddy (HTTPS), Prometheus + Grafana, WireGuard (домофоны) |

---

## Возможности

- **Заявки** — карта, список с фильтрами и сохранёнными видами, календарь, машина
  состояний статусов (`DONE`/`CANCELLED` с обязательным комментарием), фото до/после,
  комментарии, импорт из текста.
- **Адреса** — адресная база с привязкой заявок, назначение адресов исполнителям
  («Мои адреса»), карточка адреса.
- **Домофоны Beward** — открытие двери, статус, снимок с камеры, коды ключей;
  доступ к панелям через on-demand WireGuard.
- **Чат** — групповые и личные чаты, реакции, упоминания, фото, прикрепление заявки,
  realtime по WebSocket, push (FCM и Web Push).
- **Организации** — изоляция данных по tenant, org-admin, произвольные группы
  пользователей как роли.
- **Аналитика** — дашборд, SLA, финансы, отчёты, экспорт.
- **Offline-first Android** — Room-outbox, синхронизация с сохранением локальных
  изменений, обновления APK из портала.
- **Безопасность** — ротация refresh-сессий, rate limiting, IP-guard (бан, brute-force,
  DDoS), аудит входов.
- **Эксплуатация** — резервное копирование PostgreSQL (pg_dump), метрики Prometheus,
  поддержка (тикеты).

---

## Структура

```
MyJobInMap/
├── app/            # Android (Kotlin, Compose)
├── portal/         # Веб-портал (React + TypeScript)
├── server/         # Backend (FastAPI): app/, alembic/, tests/, scripts/
├── bot/            # Telegram-бот
├── deploy/         # Конфиги развёртывания (WireGuard)
├── monitoring/     # Prometheus / Grafana
├── scripts/        # Деплой, проверки, генерация моделей, changelog
├── docs/           # Аудит, архитектура портала, ADR (docs/brain)
└── docker-compose.*.yml, Caddyfile, Makefile
```

---

## Быстрый старт

Подробно — в [GETTING_STARTED.md](GETTING_STARTED.md). Кратко:

```bash
# Весь стек в Docker (PostgreSQL + Redis + API + worker + бот)
docker-up.cmd                          # http://localhost:8001/docs, /portal/

# Или сервер на хосте
docker compose -f docker-compose.postgres.yml up -d db
make install-deps                      # server/venv + requirements(-dev).txt
make migrate                           # Alembic
make run-server                        # http://localhost:8001

# Портал с hot reload
cd portal && npm install && npm run dev   # http://localhost:3000/portal/
```

Android: открыть проект в Android Studio, сервер в эмуляторе — `10.0.2.2:8001`.

---

## Проверки

| Где | Команда | В CI |
|-----|---------|------|
| Сервер | `make test` (pytest), `make format` (black + isort) | black → isort → pytest, покрытие ≥ 75%, SQLite и PostgreSQL |
| Портал | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` | tsc + build |
| Android | `gradlew :app:testDebugUnitTest` | — |

Python-окружение одно — `server/venv`; dev-инструменты зафиксированы в
`server/requirements-dev.txt` и совпадают с CI.

---

## Ключевые API-эндпоинты

Полный список — Swagger на `/docs`.

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/login`, `/api/auth/refresh` | Вход и ротация refresh-сессии |
| GET | `/api/auth/me` | Текущий пользователь |
| GET / POST | `/api/tasks` | Список (пагинация до 100) / создание заявки |
| PATCH | `/api/tasks/{id}/status` | Смена статуса |
| GET / POST | `/api/addresses` | Адресная база |
| GET / POST | `/api/chat/conversations` | Чаты |
| WS | `/ws?token=…` | Realtime-события чата и заявок |
| GET | `/health` | Liveness/readiness (503 при недоступной БД) |

---

## Разработка

- **API-эндпоинт:** роутер в доменном пакете `server/app/api/<домен>/`, схема в
  `server/app/schemas/`, логика в `server/app/services/`. Изменение модели — миграция
  Alembic, см. [server/MIGRATIONS.md](server/MIGRATIONS.md).
- **Типы клиентов:** после изменения API — `npm run gen:api` в `portal/` и
  `scripts/gen-android-models.ps1` для Android.
- **Страница портала:** компонент в `portal/src/pages/`, запись в реестре
  `portal/src/config/portalRoutes.tsx` (маршрут, права, пункт меню).
- **Версия Android:** `versionCode` / `versionName` в `app/build.gradle.kts`.
- **Коммиты:** [conventional commits](https://www.conventionalcommits.org/ru/)
  (`feat(portal): …`, `fix(server): …`) — из них генерируется CHANGELOG.
- **Уборка:** `make clean` удаляет сборки, кэши и скриншоты (`scripts/clean.ps1`).

## Деплой

`scripts/sync-update-server.ps1 -Server <user@host> -SshKeyPath <key> -WireGuard` —
сборка портала, синхронизация кода, пересборка образов и проверка healthcheck.
`-Provision` выполняет первичную настройку сервера (Docker, Caddy + SSL, firewall).
Серверный `.env` не перезаписывается без явного `-IncludeServiceEnvFiles`.

---

## Документация

| Файл | Описание |
|------|----------|
| [GETTING_STARTED.md](GETTING_STARTED.md) | Быстрый старт и локальная разработка |
| [ROADMAP.md](ROADMAP.md) | Что планируется дальше |
| [CHANGELOG.md](CHANGELOG.md) | История изменений (генерируется из коммитов) |
| [server/README.md](server/README.md) | Backend: конфигурация, структура, команды |
| [server/MIGRATIONS.md](server/MIGRATIONS.md) | Миграции БД |
| [portal/README.md](portal/README.md) | Портал: роли, структура |
| [docs/TECHNICAL_AUDIT_2026-10-25.md](docs/TECHNICAL_AUDIT_2026-10-25.md) | Технический аудит и статус исправлений |
| [docs/PORTAL_UX_ARCHITECTURE.md](docs/PORTAL_UX_ARCHITECTURE.md) | UX-архитектура портала |
| [deploy/wireguard/README.md](deploy/wireguard/README.md) | WireGuard для домофонов |
| [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) | Push-уведомления (Firebase) |
| [docs/brain/](docs/brain/README.md) | ADR и заметки (Obsidian vault) |

---

## Лицензия

MIT License
