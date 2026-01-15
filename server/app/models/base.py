"""
Database Base
==============
Базовая конфигурация SQLAlchemy.
"""

from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool

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


print(f"DB: {'PostgreSQL' if settings.is_postgres else 'SQLite' if settings.is_sqlite else 'Unknown'}")
print(f"URL: {SQLALCHEMY_DATABASE_URL[:50]}..." if len(SQLALCHEMY_DATABASE_URL) > 50 else f"URL: {SQLALCHEMY_DATABASE_URL}")


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
