"""
FieldWorker API Server
======================
REST API для управления заявками выездных сотрудников.

Запуск:
    uvicorn main:app --reload --host 0.0.0.0 --port 8001

Или:
    cd server
    python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001
"""

import logging
import os
import sys
import threading
import uuid
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import api_router, get_v2_router
from app.config import settings
from app.models import engine, get_db, init_db
from app.models.base import run_migrations
from app.services import create_default_users, init_firebase
from app.services.backup_scheduler import (get_scheduler_status,
                                           start_scheduler, stop_scheduler)
from app.services.websocket_manager import ws_manager

# ============================================================================
# Lifespan events
# ============================================================================


# Настройка логирования
def setup_logging():
    """Настройка логирования с поддержкой JSON для production."""
    log_format = settings.LOG_FORMAT if hasattr(settings, "LOG_FORMAT") else "text"
    log_level = (
        getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
        if hasattr(settings, "LOG_LEVEL")
        else logging.INFO
    )

    if log_format == "json":
        # JSON формат для production (легко парсить в ELK/Loki)
        import json

        class JsonFormatter(logging.Formatter):
            def format(self, record):
                log_record = {
                    "timestamp": self.formatTime(record, self.datefmt),
                    "level": record.levelname,
                    "logger": record.name,
                    "message": record.getMessage(),
                }
                if record.exc_info:
                    log_record["exception"] = self.formatException(record.exc_info)
                return json.dumps(log_record, ensure_ascii=False)

        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logging.basicConfig(level=log_level, handlers=[handler])
    else:
        # Текстовый формат для разработки.
        logging.basicConfig(
            level=log_level,
            format="%(asctime)s [%(levelname)s] %(message)s",
            handlers=[logging.StreamHandler()],
        )


setup_logging()
logger = logging.getLogger(__name__)

METRICS_ENABLED = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup и shutdown события"""
    # Startup
    app.state.start_time = datetime.now(
        timezone.utc
    )  # Инициализация времени старта для uptime

    logger.info("🚀 Starting FieldWorker Server...")
    logger.info(f"   📁 Base dir: {settings.BASE_DIR}")
    logger.info(f"   🗄️ Database: {settings.DATABASE_URL}")

    # Миграции БД (Alembic) + создание новых таблиц
    run_migrations()
    init_db()

    # Создание дефолтных пользователей
    db = next(get_db())
    try:
        create_default_users(db)
    finally:
        db.close()

    # Инициализация Firebase
    init_firebase()

    # Запуск планировщика бэкапов (если включён)
    start_scheduler()

    logger.info("✅ Server ready!")
    logger.info(f"   📡 API docs: http://localhost:{settings.PORT}/docs")
    logger.info(f"   🖥️  Admin: http://localhost:{settings.PORT}/admin")

    yield  # Приложение работает

    # Shutdown
    logger.info("🛑 Shutting down server...")
    stop_scheduler()
    engine.dispose()

    # Ждём завершения фоновых потоков
    for thread in threading.enumerate():
        if thread.daemon and thread.is_alive() and thread.name != "MainThread":
            thread.join(timeout=2.0)

    logger.info("👋 Server stopped")


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title=settings.API_TITLE,
    description=settings.API_DESCRIPTION,
    version=settings.API_VERSION,
    lifespan=lifespan,
)

# CORS — настраивается через переменную окружения CORS_ORIGINS
# По умолчанию разрешены все origins для разработки
_cors_origins = settings.CORS_ORIGINS
if "*" in _cors_origins and settings.is_production:
    logger.warning(
        "⚠️  CORS allow_origins=['*'] в production! "
        "Задайте CORS_ORIGINS в .env (через запятую)"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=len(_cors_origins) > 0 and "*" not in _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Request ID Middleware — уникальный ID для каждого запроса
# ============================================================================


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Добавляет уникальный X-Request-ID к каждому запросу для трассировки."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestIDMiddleware)


# ============================================================================
# Prometheus Metrics — /metrics endpoint
# ============================================================================

try:
    from prometheus_fastapi_instrumentator import Instrumentator

    instrumentator = Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        should_respect_env_var=False,
        excluded_handlers=["/metrics", "/health", "/health/detailed"],
        env_var_name="ENABLE_METRICS",
    )
    instrumentator.instrument(app).expose(
        app, endpoint="/metrics", include_in_schema=False
    )
    METRICS_ENABLED = True
    logger.info("📊 Prometheus metrics enabled at /metrics")
except ImportError:
    METRICS_ENABLED = False


# ============================================================================
# Global Exception Handlers
# ============================================================================


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Унифицированный формат ошибок валидации Pydantic."""
    errors = []
    for error in exc.errors():
        field = " → ".join(str(loc) for loc in error["loc"])
        errors.append(
            {
                "field": field,
                "message": error["msg"],
                "type": error["type"],
            }
        )

    request_id = getattr(request.state, "request_id", None)
    logger.warning(
        "Validation error [%s]: %s %s — %d error(s)",
        request_id,
        request.method,
        request.url.path,
        len(errors),
    )
    return JSONResponse(
        status_code=422,
        content={
            "error": "Ошибка валидации",
            "details": errors,
            "request_id": request_id,
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Централизованный обработчик непойманных исключений — JSON вместо stack trace."""
    request_id = getattr(request.state, "request_id", None)
    logger.error(
        "Unhandled exception [%s]: %s %s — %s: %s",
        request_id,
        request.method,
        request.url.path,
        type(exc).__name__,
        str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Внутренняя ошибка сервера",
            "request_id": request_id,
        },
    )


# Статические файлы
app.mount("/static", StaticFiles(directory=str(settings.STATIC_DIR)), name="static")

# Portal SPA - НЕ используем StaticFiles, т.к. он не поддерживает SPA fallback
# Вместо этого используем кастомный route /portal/{path} ниже
logger.info(f"   🆕 Portal: http://localhost:{settings.PORT}/portal")

# API роутеры
# /api/* — основные эндпоинты (v1)
app.include_router(api_router)
# /api/v2/* — v2-specific эндпоинты (envelope формат, summary)
app.include_router(get_v2_router(), prefix="/api/v2", include_in_schema=True)
logger.info("   📡 API versioning: /api/ (default v1), /api/v2/ (extended)")


# ============================================================================
# Web Routes - Redirect to Portal
# ============================================================================


@app.get("/", include_in_schema=False)
async def root():
    """Редирект на портал"""
    return RedirectResponse(url="/portal/")


@app.get("/admin", include_in_schema=False)
async def admin_redirect():
    """Редирект /admin → /portal/"""
    return RedirectResponse(url="/portal/")


@app.get("/admin/", include_in_schema=False)
async def admin_page_redirect():
    """Редирект /admin/ → /portal/"""
    return RedirectResponse(url="/portal/")


@app.get("/admin/login", include_in_schema=False)
async def admin_login_redirect():
    """Редирект на портал (авторизация в SPA)"""
    return RedirectResponse(url="/portal/login")


@app.get("/workspace", include_in_schema=False)
async def workspace_redirect():
    """Редирект /workspace → /portal/"""
    return RedirectResponse(url="/portal/")


@app.get("/workspace/", include_in_schema=False)
async def workspace_page_redirect():
    """Редирект /workspace/ → /portal/"""
    return RedirectResponse(url="/portal/")


# ============================================================================
# SPA Fallback - для client-side routing
# ============================================================================


@app.get("/portal/", include_in_schema=False)
async def portal_index():
    """Главная страница портала"""
    portal_dist = settings.BASE_DIR.parent / "portal" / "dist"
    index_path = portal_dist / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"error": "Portal not found"}


@app.get("/portal/{full_path:path}", include_in_schema=False)
async def portal_spa_fallback(full_path: str):
    """
    SPA fallback: возвращает index.html для всех маршрутов портала.
    Это позволяет React Router работать при обновлении страницы.
    """
    portal_dist = settings.BASE_DIR.parent / "portal" / "dist"

    # Если запрашивается реальный файл (assets, images) - вернуть его
    file_path = portal_dist / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)

    # Иначе возвращаем index.html для SPA routing
    index_path = portal_dist / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    return {"error": "Portal not found"}


# ============================================================================
# Health Check
# ============================================================================


@app.get("/health", tags=["System"])
async def health_check():
    """Проверка состояния сервера с реальной проверкой БД"""
    db_status = "connected"
    try:
        db = next(get_db())
        db.execute(text("SELECT 1"))
        db.close()
    except Exception as e:
        db_status = f"error: {str(e)}"

    status = "ok" if db_status == "connected" else "degraded"
    return {"status": status, "version": settings.API_VERSION, "database": db_status}


@app.get("/health/detailed", tags=["System"])
async def health_check_detailed():
    """
    Детальная проверка состояния сервера.

    Возвращает информацию о:
    - Статус БД и количество записей
    - Firebase status
    - Использование памяти
    - Uptime и версия Python
    """
    import platform

    import psutil

    from app.models import TaskModel, UserModel
    from app.services.geocoding import geocoding_service
    from app.services.push import firebase_app

    # Database check
    db_status = "ok"
    task_count = 0
    user_count = 0
    try:
        db = next(get_db())
        task_count = db.query(TaskModel).count()
        user_count = db.query(UserModel).count()
        db.close()
    except Exception as e:
        db_status = f"error: {str(e)}"

    # Memory info
    process = psutil.Process()
    memory_info = process.memory_info()

    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "version": settings.API_VERSION,
        "python_version": platform.python_version(),
        "database": {
            "status": db_status,
            "tasks_count": task_count,
            "users_count": user_count,
        },
        "firebase": {
            "enabled": firebase_app is not None,
        },
        "geocoding": {
            "cache_size": geocoding_service.cache_size,
            "cache_max_size": geocoding_service._cache_max_size,
        },
        "backup_scheduler": get_scheduler_status(),
        "websocket": ws_manager.get_status(),
        "memory": {
            "rss_mb": round(memory_info.rss / 1024 / 1024, 2),
            "vms_mb": round(memory_info.vms / 1024 / 1024, 2),
        },
        "system": {
            "platform": platform.system(),
            "cpu_count": psutil.cpu_count(),
        },
    }


@app.get("/api/info", tags=["System"])
async def server_info(db: Session = Depends(get_db)):
    """Информация о сервере"""
    from app.models import TaskModel, TaskPhotoModel, UserModel
    from app.services.geocoding import geocoding_service
    from app.services.push import firebase_app

    # Время работы сервера
    uptime_seconds = int(
        (datetime.now(timezone.utc) - app.state.start_time).total_seconds()
    )
    hours = uptime_seconds // 3600
    minutes = (uptime_seconds % 3600) // 60
    uptime = f"{hours}ч {minutes}м" if hours > 0 else f"{minutes}м"

    # Размер БД — извлекаем путь из настроек
    db_url = settings.DATABASE_URL
    if db_url.startswith("sqlite"):
        db_path = db_url.split("///")[-1] if "///" in db_url else "tasks.db"
    else:
        db_path = None
    if db_path and os.path.exists(db_path):
        db_size_bytes = os.path.getsize(db_path)
        if db_size_bytes > 1024 * 1024:
            database_size = f"{db_size_bytes / (1024 * 1024):.1f} МБ"
        else:
            database_size = f"{db_size_bytes / 1024:.1f} КБ"
    else:
        database_size = "N/A"

    # Статистика
    tasks_count = db.query(TaskModel).count()
    users_count = db.query(UserModel).count()
    photos_count = db.query(TaskPhotoModel).count()

    return {
        "version": settings.API_VERSION,
        "uptime": uptime,
        "database_size": database_size,
        "tasks_count": tasks_count,
        "users_count": users_count,
        "photos_count": photos_count,
        "firebase_enabled": firebase_app is not None,
        "geocoding_cache_size": geocoding_service.cache_size,
    }


# ============================================================================
# Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=False,
        access_log=False,
        log_level="info",
    )
