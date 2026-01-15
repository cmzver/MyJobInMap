# FieldWorker Backend Server

> **Версия:** 2.3.0 | **Порт:** 8001

REST API сервер для управления заявками выездных сотрудников.

## Стек

- **FastAPI** — веб-фреймворк
- **SQLAlchemy** — ORM для SQLite/PostgreSQL
- **Pydantic** — валидация данных
- **JWT** — аутентификация
- **Firebase Admin SDK** — push-уведомления
- **Geopy (Nominatim)** — геокодирование с кэшированием
- **Pillow** — оптимизация изображений
- **pytest** — тестирование (205+ тестов)

## Быстрый старт

```bash
cd server
pip install -r requirements.txt
make seed           # Тестовые данные (admin/admin)
make run-server     # http://localhost:8001
```

## Структура

```
server/
├── main.py                 # Entry point
├── app/
│   ├── config.py           # Settings (API_VERSION, paths)
│   ├── api/                # API роутеры (13 файлов)
│   ├── models/             # SQLAlchemy ORM (9 файлов)
│   ├── schemas/            # Pydantic схемы (9 файлов)
│   ├── services/           # Бизнес-логика (11 файлов)
│   └── utils/              # Утилиты
├── backups/                # Резервные копии БД
├── tests/                  # pytest тесты
├── templates/              # Jinja2 шаблоны
├── static/                 # JS старой админки
└── uploads/                # Загруженные фото
```

## API Endpoints

### Основные
| Endpoint | Описание |
|----------|----------|
| `POST /api/auth/login` | Вход (rate limit: 5/60s) |
| `GET /api/tasks` | Список заявок (пагинация) |
| `POST /api/tasks` | Создать заявку |
| `PUT /api/tasks/{id}/status` | Изменить статус |

### Бэкапы
| Endpoint | Описание |
|----------|----------|
| `GET /api/admin/backup/list` | Список бэкапов |
| `POST /api/admin/backup/run` | Создать бэкап |
| `POST /api/admin/backup/restore/{filename}` | Восстановить |

### Web UI
| URL | Описание |
|-----|----------|
| `/portal/` | React Portal |
| `/admin/` | Bootstrap админка |
| `/docs` | Swagger документация |
| `/health` | Статус + версия |

## Команды (Makefile)

```bash
make run-server     # Запуск на :8001
make test           # Все тесты (205+)
make seed           # Тестовые данные
make format         # Black + isort
make clean          # Очистка кэша
make help           # Справка
```

## Конфигурация (.env)

```env
DATABASE_URL=sqlite:///./tasks.db
SECRET_KEY=your-secret-key-here
FIREBASE_CREDENTIALS=firebase-service-account.json
HOST=0.0.0.0
PORT=8001
```

## Версия

Версия хранится в `app/config.py`:
```python
API_VERSION: str = "2.3.0"
```

Отображается в `/health`:
```json
{"status": "ok", "version": "2.3.0", "database": "connected"}
```

---

**Последнее обновление:** 13 января 2026
