# FieldWorker - Полная документация проекта

## Обзор проекта
**FieldWorker** - система управления полевыми заявками (field service management).
Состоит из: Android-приложение для исполнителей, веб-портал (React), FastAPI сервер.

---

## 🏗️ Архитектура

### Android приложение (`app/`)
- **Clean Architecture**: Data → Domain → Presentation
- **MVVM** паттерн с Jetpack Compose
- **Hilt** для Dependency Injection

### Веб-портал (`portal/`)
- **React 18** + TypeScript
- **Vite 5** для сборки
- **TailwindCSS** для стилей
- **TanStack Query** для API
- **Zustand** для state management
- **React Router 6** для навигации (с `basename="/portal"`)

### Backend сервер (`server/`)
- **FastAPI** (Python) на порту **8001**
- **Модульная архитектура** (v2.0): app/models, app/schemas, app/api, app/services
- **SQLite** база данных (tasks.db)
- **JWT** аутентификация

---

## 📁 Структура проекта

```
MyJobInMap/
├── app/                          # Android приложение (Kotlin)
│   └── src/main/java/com/fieldworker/
│       ├── data/                 # API, DTO, Repository, Room DB
│       ├── domain/               # UseCase, Models
│       ├── di/                   # Hilt DI modules
│       └── ui/                   # Compose Screens, ViewModels
│
├── portal/                       # Веб-портал (React + TypeScript)
│   └── src/
│       ├── api/                  # Axios API client
│       ├── components/           # UI компоненты
│       ├── pages/                # 18 страниц
│       ├── hooks/                # React Query хуки
│       ├── store/                # Zustand stores
│       └── App.tsx               # Роутинг (basename="/portal")
│
├── server/                       # FastAPI backend
│   ├── main.py                   # Entry point, SPA fallback routes
│   ├── app/
│   │   ├── config.py             # Централизованная конфигурация (API_VERSION)
│   │   ├── api/                  # API роутеры (15 файлов)
│   │   ├── models/               # SQLAlchemy модели (9 файлов)
│   │   ├── schemas/              # Pydantic схемы (9 файлов)
│   │   └── services/             # Бизнес-логика (11 файлов)
│   ├── backups/                  # Резервные копии БД (*.sqlite.gz)
│   ├── tests/                    # pytest тесты (490+)
│   ├── templates/                # Jinja2 (admin.html, workspace.html)
│   └── static/                   # JS старой админки
│
├── bot/                          # Telegram бот
└── docs/                         # Документация
```

---

## API Endpoints (сервер на порту 8001)

### Аутентификация
| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/login` | Вход (username, password) → JWT token. **Rate limit: 5/60s** |
| GET | `/api/auth/me` | Информация о текущем пользователе |

### Заявки (Tasks)
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/tasks` | Список заявок (пагинация: `items`, `total`, `page`, `size`) |
| GET | `/api/tasks/{id}` | Одна заявка по ID |
| POST | `/api/tasks` | Создать заявку |
| PUT | `/api/tasks/{id}` | Обновить заявку |
| PATCH | `/api/tasks/{id}/status` | Изменить статус (валидация переходов) |
| PATCH | `/api/tasks/{id}/planned-date` | Обновить плановую дату |
| PATCH | `/api/tasks/{id}/assign` | Назначить заявку |
| DELETE | `/api/tasks/{id}` | Удалить заявку |

### Комментарии и Фото
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/tasks/{id}/comments` | Комментарии заявки |
| POST | `/api/tasks/{id}/comments` | Добавить комментарий |
| POST | `/api/tasks/{id}/photos` | Загрузить фото (multipart) |
| DELETE | `/api/photos/{id}` | Удалить фото |

### Админ-функции (Backups)
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/backups` | Список бэкапов |
| POST | `/api/admin/backups` | Создать бэкап |
| GET | `/api/admin/backups/{filename}/download` | Скачать бэкап |
| POST | `/api/admin/backups/{filename}/restore` | **Восстановить из бэкапа** |
| DELETE | `/api/admin/backups/{filename}` | Удалить бэкап |
| GET/PATCH | `/api/admin/backups/settings` | Настройки бэкапов |
<<<<<<< HEAD

### Чат (Chat)
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/chat/conversations` | Список чатов пользователя (с unread_count) |
| POST | `/api/chat/conversations` | Создать чат (direct/group/task/org_general) |
| GET | `/api/chat/conversations/{id}` | Детали чата (участники, настройки) |
| PATCH | `/api/chat/conversations/{id}` | Обновить чат (переименовать группу) |
| POST | `/api/chat/conversations/{id}/members` | Добавить участников |
| DELETE | `/api/chat/conversations/{id}/members/{user_id}` | Удалить участника |
| PATCH | `/api/chat/conversations/{id}/mute` | Mute/unmute чата |
| PATCH | `/api/chat/conversations/{id}/archive` | Архивация чата |
| GET | `/api/chat/conversations/{id}/messages` | Сообщения (cursor: before_id, limit) |
| POST | `/api/chat/conversations/{id}/messages` | Отправить сообщение (text, reply_to_id) |
| PATCH | `/api/chat/messages/{id}` | Редактировать сообщение (своё, 24ч) |
| DELETE | `/api/chat/messages/{id}` | Soft-delete сообщения |
| POST | `/api/chat/conversations/{id}/messages/search` | Поиск по сообщениям (ILIKE) |
| POST | `/api/chat/messages/{id}/attachments` | Загрузить вложение (10MB, оптимизация) |
| POST | `/api/chat/messages/{id}/reactions` | Toggle реакции (emoji) |
| POST | `/api/chat/conversations/{id}/read` | Пометить прочитанным (read receipt) |
| GET | `/api/chat/task/{task_id}` | Получить/создать чат заявки |
=======
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91

### Отчёты и Аналитика
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/reports` | Аналитика (today, week, month, year, custom) |
| GET | `/api/reports/export` | Экспорт отчёта в CSV |

### Другие
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/dashboard/stats` | Статистика для Dashboard |
| GET | `/api/finance/summary` | Финансовая сводка |
| GET | `/api/devices` | Список устройств |
| POST | `/api/devices` | Регистрация FCM токена |
| GET | `/api/devices/info` | Информация об устройстве |
| GET | `/api/updates/check` | Проверить наличие новой APK версии |
| GET | `/api/updates/download` | Скачать последнюю APK версию |
| GET | `/health` | Статус сервера + версия |

### Адреса (Addresses)
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/addresses` | Список адресов с пагинацией |
| GET | `/api/addresses/{id}` | Карточка адреса |
| POST | `/api/addresses` | Создать адрес |
| PATCH | `/api/addresses/{id}` | Обновить адрес |
| GET | `/api/addresses/autocomplete/cities` | Автоподставление городов |
| GET | `/api/addresses/autocomplete/streets` | Автоподставление улиц |
| GET | `/api/addresses/autocomplete/buildings` | Автоподставление домов |
| GET | `/api/addresses/{id}/systems` | Системы адреса (CRUD) |
| GET | `/api/addresses/{id}/equipment` | Оборудование адреса (CRUD) |
| GET | `/api/addresses/{id}/documents` | Документы адреса (CRUD) |
| GET | `/api/addresses/{id}/contacts` | Контакты адреса (CRUD) |
| GET | `/api/addresses/{id}/history` | История изменений |

### Web UI
| URL | Описание |
|-----|----------|
| `/portal/` | React Portal (SPA с fallback) |
| `/admin/` | Старая Bootstrap админка |
| `/workspace/` | Рабочее место |

---

## 📊 Модели данных

### TaskStatus
- `NEW` - Новая (красный)
- `IN_PROGRESS` - В работе (оранжевый)
- `DONE` - Выполнена (зелёный)
- `CANCELLED` - Отменена (серый)

### Priority (хранится как int 1-4)
| Int | Enum | Отображение | Цвет |
|-----|------|-------------|------|
| 1 | `PLANNED` | Плановая | Зелёный |
| 2 | `CURRENT` | Текущая | Синий |
| 3 | `URGENT` | Срочная | Оранжевый |
| 4 | `EMERGENCY` | Аварийная | Красный |

### UserRole
- `admin` - Полный доступ
- `dispatcher` - Создание/редактирование заявок
- `worker` - Просмотр назначенных заявок

---

## ⚠️ Важные замечания

### Сервер
- ⚠️ **Порт 8001** (не 8000)
<<<<<<< HEAD
- ⚠️ **Версия** в `app/config.py` → `API_VERSION = "2.15.0"`
=======
- ⚠️ **Версия** в `app/config.py` → `API_VERSION = "2.14.2"`
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
- ⚠️ **REST стандарт**: PATCH для частичных обновлений, PUT для полных замен
- ⚠️ **Rate Limiting** на `/api/auth/login` (5 попыток / 60 сек на IP)
- ⚠️ **Пагинация**: `/api/tasks` возвращает `{ items: [], total, page, size }`
- ⚠️ **Бэкапы** хранятся в `server/backups/` как `*.sqlite.gz`
- ⚠️ **Android updates**: публикация APK идёт через `/api/updates/*`, а `versionName`/`versionCode` извлекаются сервером из самого APK

### Переходы статусов (State Machine)
```
NEW → IN_PROGRESS, CANCELLED
IN_PROGRESS → DONE, CANCELLED
DONE → терминальный статус
CANCELLED → терминальный статус
```

### Portal
- ⚠️ **BrowserRouter** с `basename="/portal"`
- ⚠️ **SPA Fallback** в main.py для `/portal/*` роутов
- ⚠️ **Токен** в `localStorage['fieldworker-auth']` как JSON
- ⚠️ **API** использует относительные URL (`/api/...`)

### Android
- ⚠️ **Эмулятор** подключается через `10.0.2.2:8001`
- ⚠️ **URL фото** через `getFullServerUrl()` (с портом)
<<<<<<< HEAD
- ⚠️ **Версия Android-приложения** в `app/build.gradle.kts` → `versionCode = 21500`, `versionName = "2.15.0"`
=======
- ⚠️ **Версия Android-приложения** в `app/build.gradle.kts` → `versionCode = 21402`, `versionName = "2.14.2"`
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91

---

## 🛠️ Команды разработки

### Server
```bash
cd server
make run-server          # http://localhost:8001
make test                # Все тесты (490+)
make seed                # Тестовые данные (admin/admin)
make format              # Black + isort
```

### Portal
```bash
cd portal
npm install
npm run dev              # http://localhost:5173
npm run build            # Сборка в dist/
```

---

## 📝 Обновление версии

1. `server/app/config.py` → `API_VERSION = "X.Y.Z"`
2. `app/build.gradle.kts` → `versionCode`, `versionName`
3. `CHANGELOG.md` → добавить запись
4. `README.md` → обновить упоминание версии

---

## 🔒 Безопасность

### Rate Limiting
- **Endpoint**: `/api/auth/login`
- **Лимит**: 5 неудачных попыток на IP
- **Окно**: 60 секунд
- **Ответ**: `429 Too Many Requests` + заголовок `Retry-After`

### Backups
- Защита от path traversal (проверка `..`, `/`, `\`)
- Только для админов
- Автоматический pre-restore бэкап перед восстановлением

---

## 📚 Документация

| Файл | Описание |
|------|----------|
| `README.md` | Основной гайд |
| `AGENTS.md` | Инструкции для AI агентов |
| `CHANGELOG.md` | История версий |
| `GETTING_STARTED.md` | Быстрый старт (5 мин) |
| `docs/FIREBASE_SETUP.md` | Push-уведомления |
| `docs/HTTPS_SETUP.md` | SSL сертификаты |
| `docs/DEPLOYMENT.md` | Развертывание |

---

## Known Tech Debt

- [x] ~~Pydantic v1 deprecation~~ → Миграция на `ConfigDict` завершена
- [x] ~~`datetime.utcnow()`~~ → Заменено на `datetime.now(timezone.utc)`
- [x] ~~Portal: дублирование кода~~ → Удалено ~600 строк + ~120 строк (dateFormat.ts)
- [x] ~~Portal: `any` типы~~ → Исправлено 12 типов
- [x] ~~Тесты `test_task_state_machine`~~ → state machine обновлён
- [x] ~~admin.py монолит~~ → Разделён на admin.py + admin_users.py + admin_backups.py
- [x] ~~Portal: дублирование User/UserRole~~ → AuthUser + единый UserRole
- [x] ~~Modal без ARIA~~ → role, aria-modal, focus trap
- [Строка удалена] ~~Portal: предсуществующие TS ошибки~~ → Исправлено: SystemSelector.model, AdminSettings.SettingValue, TaskDetail.amount
- [x] ~~Portal: `any` обработка ошибок API~~ → `apiError.ts` — единый error handler
- [x] ~~Portal: Spinner вместо Skeleton~~ → `Skeleton.tsx` компоненты
- [x] ~~Portal: noUncheckedIndexedAccess~~ → Включено, ~60 ошибок исправлено
- [x] ~~Тестовое покрытие сервера~~ → 490+ тестов
- [x] ~~Portal unit тесты~~ → 44 теста (Vitest: dateFormat, cn, apiError, getSla)
- [x] ~~`set_setting()` не поддерживал upsert~~ → Исправлено: upsert + description/group/label
- [x] ~~Android unit тесты~~ → 85 тестов (LoginViewModel, MapViewModel, OfflineFirstTasksRepository)
- [x] ~~Navigation Compose~~ → `Screen.kt` + `NavHost` в `MainScreen.kt`
- [x] ~~Paging 3~~ → `room-paging` + `PagingSource` + `LazyPagingItems` в TaskListScreen
- [x] ~~Token refresh~~ → `/api/auth/refresh` + `TokenAuthenticator` + 8 тестов

---

<<<<<<< HEAD
**Версия:** 2.15.0 (Phase 11 — Многофункциональный чат: Backend + Portal + Android)
=======
**Версия:** 2.14.2 (Phase 10.2 — Статусы, Android filters и компактный список)
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
**Статус:** ✅ Production Ready  
**Последнее обновление:** 12 марта 2026
