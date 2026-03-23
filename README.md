# 🚀 FieldWorker - Field Service Management System

**Android-приложение** для исполнителей + **React веб-портал** для диспетчеров + **FastAPI сервер** (порт 8001).

**Статус:** ✅ PRODUCTION READY | **Версия:** 2.18.0 | **Тесты:** 490+ ✅

---

## 🛠 Стек технологий

### **Android (Kotlin)**
- **Jetpack Compose** + Material 3 — декларативный UI
- **Hilt** — Dependency Injection
- **Room** — локальная база (offline-first)
- **Retrofit 2** — REST API клиент
- **OSMDroid** — карты OpenStreetMap
- **Coroutines + StateFlow** — асинхронность

### **Backend (Python)**
- **FastAPI** — современный REST API фреймворк
- **SQLAlchemy ORM** — работа с БД
- **Pydantic** — валидация данных
- **SQLite** — база данных (PostgreSQL опционально)
- **JWT** — аутентификация
- **pytest** — тестирование (490+ тестов)

### **Web Portal (React)**
- **React 18** + TypeScript 5
- **Vite 5** — сборка
- **TailwindCSS 3.4** — стилизация
- **TanStack Query** — работа с API
- **Zustand** — state management
- **React Router 6** — роутинг

---

## 📁 Структура проекта

```
MyJobInMap/
├── app/                    # Android приложение (Kotlin)
│   └── src/main/java/com/fieldworker/
│       ├── data/           # API, Repository, Room DB
│       ├── domain/         # UseCase, Models
│       ├── di/             # Hilt DI
│       └── ui/             # Compose UI, ViewModels
│
├── portal/                 # React веб-портал
│   └── src/
│       ├── api/            # Axios client
│       ├── pages/          # 18 страниц
│       ├── components/     # UI компоненты
│       ├── hooks/          # React Query hooks
│       └── store/          # Zustand stores
│
├── server/                 # FastAPI backend
│   ├── main.py             # Entry point
│   ├── app/
│   │   ├── api/            # API роутеры
│   │   ├── models/         # SQLAlchemy ORM
│   │   ├── schemas/        # Pydantic валидация
│   │   └── services/       # Бизнес-логика
│   ├── backups/            # Резервные копии БД
│   └── tests/              # pytest тесты
│
├── bot/                    # Telegram бот (опционально)
├── docs/                   # Документация
└── *.md                    # README, CHANGELOG, etc.
```

---

## 🚀 Быстрый старт

### 1. Backend

```bash
cd server
pip install -r requirements.txt
make seed                    # Создать тестовые данные (admin/admin)
make run-server              # Запуск на http://localhost:8001
```

### 2. Web Portal

```bash
cd portal
npm install
npm run dev                  # Запуск на http://localhost:5173
```

Или: откройте http://localhost:8001/portal/ (встроенный)

### 3. Android

```bash
# Android Studio: File → Open → MyJobInMap
# Run на эмуляторе (сервер: 10.0.2.2:8001)
```

### 4. Тесты

```bash
cd server
make test                    # Все тесты (490+)
```

---

## 📡 API Endpoints

Сервер на **http://localhost:8001** | Документация: **/docs**

### Аутентификация
| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/login` | Вход (**rate limit: 5/60s**) |
| GET | `/api/auth/me` | Текущий пользователь |

### Заявки
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/tasks` | Список (пагинация: `items`, `total`) |
| POST | `/api/tasks` | Создать заявку |
| PATCH | `/api/tasks/{id}/status` | Изменить статус. Для `DONE` и `CANCELLED` комментарий обязателен |
| DELETE | `/api/tasks/{id}` | Удалить |

### Админ-функции
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/backup/list` | Список бэкапов |
| POST | `/api/admin/backup/run` | Создать бэкап |
| POST | `/api/admin/backup/restore/{name}` | Восстановить из бэкапа |
| GET | `/api/reports` | Аналитика |

### Web UI
| URL | Описание |
|-----|----------|
| `/portal/` | React веб-портал |
| `/admin/` | Старая Bootstrap админка |
| `/health` | Статус сервера + версия |

---

## 🔒 Безопасность

### Rate Limiting
- **Endpoint:** `/api/auth/login`
- **Лимит:** 5 попыток / 60 секунд на IP
- **Ответ:** `429 Too Many Requests`

### Валидация статусов
```
NEW → IN_PROGRESS → DONE
  ↘      ↗
   CANCELLED
```

### Комментарий к статусу
- При переводе заявки в `DONE` или `CANCELLED` API требует непустой `comment`.
- При переводе в `IN_PROGRESS` комментарий остаётся необязательным.

---

## ⚙️ Команды (Makefile)

```bash
cd server

make run-server     # Запуск сервера
make test           # Все тесты
make seed           # Тестовые данные
make format         # Black + isort
make clean          # Очистка кэша
make help           # Справка
```

---

## 📚 Документация

| Файл | Описание |
|------|----------|
| [README.md](README.md) | Вы здесь |
| [GETTING_STARTED.md](GETTING_STARTED.md) | Быстрый старт (5 мин) |
| [CHANGELOG.md](CHANGELOG.md) | История версий |
| [AGENTS.md](AGENTS.md) | Инструкции для AI |
| [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) | Push-уведомления |
| [docs/HTTPS_SETUP.md](docs/HTTPS_SETUP.md) | SSL сертификаты |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Развертывание |

---

## 🎯 Основные фичи

### Версия 2.14.2 (Март 2026)
- ✅ **Организации и multi-tenant** — изоляция данных по организациям и org-admin сценарии
- ✅ **SLA и аналитика** — расширенные метрики и агрегированные summary endpoints
- ✅ **Android updates** — публикация APK из админки, извлечение версии из APK и ручная проверка обновлений в приложении
- ✅ **API Versioning** — `v2` endpoints и envelope-формат ответов
- ✅ **Статусы заявок** — единая state machine, обязательный комментарий для `DONE` и `CANCELLED`, синхронизация portal/server/workspace/Android

### Ключевые возможности
- 📱 **Android** — карта заявок, offline-режим, push-уведомления
- 📱 **Обновления Android** — публикация APK, извлечение версии из APK и ручная проверка обновлений
- 🖥️ **Портал** — Dashboard, управление заявками, аналитика
- 🔐 **Безопасность** — JWT, rate limiting, role-based access
- 📊 **Отчёты** — статистика по периодам, экспорт CSV
- 💾 **Бэкапы** — автоматические и ручные резервные копии

---

## 🐛 Разработка

### Добавить API endpoint
1. Создать роутер в `server/app/api/`
2. Добавить схему в `server/app/schemas/`
3. Зарегистрировать в `server/app/api/__init__.py`

### Добавить страницу портала
1. Создать в `portal/src/pages/`
2. Добавить роут в `portal/src/App.tsx`
3. Добавить в меню `portal/src/config/menuConfig.ts`

### Обновить версию
1. `server/app/config.py` → `API_VERSION`
2. `app/build.gradle.kts` → `versionCode`, `versionName`
3. `CHANGELOG.md` → новая запись

---

## 📝 Лицензия

MIT License

---

**Версия:** 2.18.0  
**Последнее обновление:** 24 марта 2026  
**Статус:** ✅ Production Ready
