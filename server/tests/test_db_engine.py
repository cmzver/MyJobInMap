"""Тесты переключения режима БД (SQLite / PostgreSQL).

DATABASE_URL — единственный переключатель режима; create_db_engine выбирает
параметры engine по диалекту. PostgreSQL-engine конструируется без подключения,
поэтому тест не требует живого Postgres.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.models.base import create_db_engine, get_database_url


class TestEngineSelection:
    def test_sqlite_uses_static_pool(self):
        eng = create_db_engine("sqlite:///:memory:")
        try:
            assert eng.dialect.name == "sqlite"
            assert isinstance(eng.pool, StaticPool)
        finally:
            eng.dispose()

    def test_postgres_dialect_and_pool(self):
        eng = create_db_engine("postgresql+psycopg2://u:p@h:5432/d")
        try:
            assert eng.dialect.name == "postgresql"
            # пул соединений с заданным размером (web + worker)
            assert eng.pool.size() == 10
        finally:
            eng.dispose()

    def test_sqlite_unicode_lower_upper(self):
        # На SQLite перегружаем lower/upper для корректной свёртки кириллицы.
        eng = create_db_engine("sqlite:///:memory:")
        try:
            with eng.connect() as c:
                assert c.execute(text("SELECT lower('ПРИВЕТ')")).scalar() == "привет"
                assert c.execute(text("SELECT upper('привет')")).scalar() == "ПРИВЕТ"
        finally:
            eng.dispose()

    def test_file_sqlite_does_not_use_static_pool(self, tmp_path):
        eng = create_db_engine(f"sqlite:///{tmp_path / 'test.db'}")
        try:
            assert not isinstance(eng.pool, StaticPool)
        finally:
            eng.dispose()

    def test_sqlite_enables_foreign_keys(self, tmp_path):
        eng = create_db_engine(f"sqlite:///{tmp_path / 'test.db'}")
        try:
            with eng.connect() as connection:
                assert connection.execute(text("PRAGMA foreign_keys")).scalar() == 1
                assert connection.execute(text("PRAGMA busy_timeout")).scalar() == 5000
        finally:
            eng.dispose()


class TestDatabaseUrlNormalization:
    def test_heroku_postgres_scheme_normalized(self, monkeypatch):
        monkeypatch.setattr(settings, "DATABASE_URL", "postgres://u:p@h/db")
        assert get_database_url().startswith("postgresql://")

    def test_sqlite_url_unchanged(self, monkeypatch):
        monkeypatch.setattr(settings, "DATABASE_URL", "sqlite:///./tasks.db")
        assert get_database_url() == "sqlite:///./tasks.db"


class TestBackendFlags:
    @pytest.mark.parametrize(
        "url,is_sqlite,is_postgres",
        [
            ("sqlite:///./tasks.db", True, False),
            ("sqlite:///:memory:", True, False),
            ("postgresql://u:p@h/db", False, True),
            ("postgresql+psycopg2://u:p@h:5432/db", False, True),
            ("postgres://u:p@h/db", False, True),
        ],
    )
    def test_is_sqlite_is_postgres(self, monkeypatch, url, is_sqlite, is_postgres):
        monkeypatch.setattr(settings, "DATABASE_URL", url)
        assert settings.is_sqlite is is_sqlite
        assert settings.is_postgres is is_postgres
