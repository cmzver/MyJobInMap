"""
Database Base
==============
Базовая конфигурация SQLAlchemy.
"""

from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool

import logging

logger = logging.getLogger(__name__)

from app.config import settings


def utcnow() -> datetime:
    """Return timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def get_database_url() -> str:
    """Получить URL базы данных"""
    url = settings.DATABASE_URL
    # Heroku-style postgres:// -> postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


SQLALCHEMY_DATABASE_URL = get_database_url()

# Настройки engine в зависимости от БД
if settings.is_sqlite:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
elif settings.is_postgres:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=300,
        pool_timeout=30,
        echo=False
    )
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, echo=False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 declarative base class."""
    pass


logger.info("DB: %s", 'PostgreSQL' if settings.is_postgres else 'SQLite' if settings.is_sqlite else 'Unknown')
logger.info("URL: %s", SQLALCHEMY_DATABASE_URL[:50] + '...' if len(SQLALCHEMY_DATABASE_URL) > 50 else SQLALCHEMY_DATABASE_URL)


def get_db():
    """Dependency для получения сессии БД"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Создание таблиц"""
    Base.metadata.create_all(bind=engine)


def run_migrations():
    """Запуск Alembic миграций (upgrade head).
    
    Безопасно для production: если alembic_version таблица уже 
    на актуальной ревизии — ничего не делает.
    Если БД до-alembic — определяет стартовую точку по наличию таблиц
    и применяет только недостающие миграции.
    """
    from pathlib import Path
    from sqlalchemy import inspect as sa_inspect
    
    alembic_dir = Path(__file__).resolve().parent.parent.parent / "alembic"
    alembic_ini = Path(__file__).resolve().parent.parent.parent / "alembic.ini"
    
    if not alembic_dir.exists() or not alembic_ini.exists():
        logger.warning("Alembic not configured, skipping migrations")
        return
    
    try:
        from alembic.config import Config
        from alembic import command
        from alembic.runtime.migration import MigrationContext
        
        alembic_cfg = Config(str(alembic_ini))
        alembic_cfg.set_main_option("script_location", str(alembic_dir))
        # Не даём Alembic перезаписывать logging приложения при старте сервера.
        alembic_cfg.attributes["configure_logger"] = False
        
        # Проверяем текущую ревизию
        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            current_rev = ctx.get_current_revision()
        
        if current_rev is None:
            # Нет alembic_version — определяем стартовую точку
            inspector = sa_inspect(engine)
            existing_tables = set(inspector.get_table_names())
            
            if not existing_tables or existing_tables == {"alembic_version"}:
                # Совсем новая БД — stamp head, create_all сделает остальное
                logger.info("🔄 New database, stamping head...")
                command.stamp(alembic_cfg, "head")
            else:
                # До-alembic БД — определяем до какой миграции дошли
                # Порядок: organizations → chat tables → avatar_path
                if "users" in existing_tables:
                    columns = {c["name"] for c in inspector.get_columns("users")}
                    if "avatar_path" in columns:
                        # Всё уже на месте
                        logger.info("🔄 All schema up to date, stamping head...")
                        command.stamp(alembic_cfg, "head")
                    elif "conversations" in existing_tables:
                        # Чат есть, аватарки нет → stamp chat migration, upgrade далее
                        logger.info("🔄 Chat tables exist, applying remaining migrations...")
                        command.stamp(alembic_cfg, "20260317_0001")
                        command.upgrade(alembic_cfg, "head")
                    elif "organizations" in existing_tables:
                        # Организации есть, чата нет → stamp org migration, upgrade далее
                        logger.info("🔄 Org tables exist, applying remaining migrations...")
                        command.stamp(alembic_cfg, "20260217_0001")
                        command.upgrade(alembic_cfg, "head")
                    else:
                        # Базовая БД без расширений → stamp base, upgrade всё  
                        logger.info("🔄 Base DB detected, applying all migrations...")
                        command.stamp(alembic_cfg, "002")
                        command.upgrade(alembic_cfg, "head")
                else:
                    logger.info("🔄 Unknown DB state, stamping head...")
                    command.stamp(alembic_cfg, "head")
        else:
            # Применяем pending миграции
            logger.info(f"🔄 Running migrations (current: {current_rev})...")
            command.upgrade(alembic_cfg, "head")
        
        # Проверяем результат
        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            new_rev = ctx.get_current_revision()
        
        if current_rev != new_rev:
            logger.info(f"✅ Migrations applied: {current_rev} → {new_rev}")
        else:
            logger.info(f"✅ Database up to date (revision: {new_rev})")
    except Exception as e:
        logger.error(f"⚠️ Migration failed: {e}. Server will continue with create_all fallback.")
