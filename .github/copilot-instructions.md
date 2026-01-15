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
│   │   ├── api/                  # API роутеры (13 файлов)
│   │   ├── models/               # SQLAlchemy модели (9 файлов)
│   │   ├── schemas/              # Pydantic схемы (9 файлов)
│   │   └── services/             # Бизнес-логика (11 файлов)
│   ├── backups/                  # Резервные копии БД (*.sqlite.gz)
│   ├── tests/                    # pytest тесты (205+)
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
| PUT | `/api/tasks/{id}/status` | Изменить статус (валидация переходов) |
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
| GET | `/api/admin/backup/list` | Список бэкапов |
| POST | `/api/admin/backup/run` | Создать бэкап |
| GET | `/api/admin/backup/download/{filename}` | Скачать бэкап |
| POST | `/api/admin/backup/restore/{filename}` | **Восстановить из бэкапа** |
| DELETE | `/api/admin/backup/{filename}` | Удалить бэкап |
| GET/PUT | `/api/admin/backup/settings` | Настройки бэкапов |

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
| POST | `/api/devices/register` | Регистрация FCM токена |
| GET | `/health` | Статус сервера + версия |

### Адреса (Addresses)
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/addresses` | Список адресов с пагинацией |
| GET | `/api/addresses/{id}` | Карточка адреса |
| POST | `/api/addresses` | Создать адрес |
| PUT | `/api/addresses/{id}` | Обновить адрес |
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
- ⚠️ **Версия** в `app/config.py` → `API_VERSION = "2.3.0"`
- ⚠️ **Rate Limiting** на `/api/auth/login` (5 попыток / 60 сек на IP)
- ⚠️ **Пагинация**: `/api/tasks` возвращает `{ items: [], total, page, size }`
- ⚠️ **Бэкапы** хранятся в `server/backups/` как `*.sqlite.gz`

### Переходы статусов (State Machine)
```
NEW → IN_PROGRESS, CANCELLED
IN_PROGRESS → DONE, CANCELLED
DONE, CANCELLED → (терминальные состояния)
```

### Portal
- ⚠️ **BrowserRouter** с `basename="/portal"`
- ⚠️ **SPA Fallback** в main.py для `/portal/*` роутов
- ⚠️ **Токен** в `localStorage['fieldworker-auth']` как JSON
- ⚠️ **API** использует относительные URL (`/api/...`)

### Android
- ⚠️ **Эмулятор** подключается через `10.0.2.2:8001`
- ⚠️ **URL фото** через `getFullServerUrl()` (с портом)

---

## 🛠️ Команды разработки

### Server
```bash
cd server
make run-server          # http://localhost:8001
make test                # Все тесты (205+)
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
2. `server/app/__init__.py` → `__version__ = "X.Y.Z"`
3. `CHANGELOG.md` → добавить запись
4. `README.md` → обновить badge версии

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
- [ ] Тесты `test_task_state_machine` требуют обновления

---

**Версия:** 2.4.0 (Address Card + Autocomplete)  
**Статус:** ✅ Production Ready  
**Последнее обновление:** 14 января 2026
