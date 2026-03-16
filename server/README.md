# FieldWorker Backend Server

> **Версия:** 2.14.2 | **Порт:** 8001

REST API сервер для управления заявками выездных сотрудников.

## Стек

- **FastAPI** — веб-фреймворк
- **SQLAlchemy** — ORM для SQLite/PostgreSQL
- **Pydantic** — валидация данных
- **JWT** — аутентификация
- **Firebase Admin SDK** — push-уведомления
- **Geopy (Nominatim)** — геокодирование с кэшированием
- **Pillow** — оптимизация изображений
- **pytest** — тестирование (490+ тестов)
- **pyaxmlparser** — извлечение версии Android-приложения из APK

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
└── uploads/                # Загруженные фото и APK обновлений
```

## API Endpoints

### Основные
| Endpoint | Описание |
|----------|----------|
| `POST /api/auth/login` | Вход (rate limit: 5/60s) |
| `GET /api/tasks` | Список заявок (пагинация) |
| `POST /api/tasks` | Создать заявку |
| `PATCH /api/tasks/{id}/status` | Изменить статус. Для `DONE` и `CANCELLED` комментарий обязателен |

### Изменение статуса заявки

`PATCH /api/tasks/{id}/status`

Пример payload:

```json
{
	"status": "DONE",
	"comment": "Работы выполнены, оборудование проверено"
}
```

Правило:
- для `DONE` и `CANCELLED` поле `comment` обязательно;
- для `NEW` → `IN_PROGRESS` комментарий можно не передавать.

### Бэкапы
| Endpoint | Описание |
|----------|----------|
| `GET /api/admin/backup/list` | Список бэкапов |
| `POST /api/admin/backup/run` | Создать бэкап |
| `POST /api/admin/backup/restore/{filename}` | Восстановить |

### Android Updates
| Endpoint | Описание |
|----------|----------|
| `GET /api/updates/check` | Проверить наличие новой APK версии |
| `POST /api/updates/upload` | Загрузить новую APK версию |
| `GET /api/updates/download` | Скачать последнюю опубликованную APK |
| `GET /api/updates/history` | История опубликованных APK версий |
| `DELETE /api/updates/{version_code}` | Удалить опубликованную версию |

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
make test           # Все тесты (490+)
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
API_VERSION: str = "2.14.2"
```

Отображается в `/health`:
```json
{"status": "ok", "version": "2.14.2", "database": "connected"}
```

---

**Последнее обновление:** 12 марта 2026
