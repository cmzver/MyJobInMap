"""Обновление старой схемы, откат и повторное обновление без потери заявки."""

from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from alembic import command
from alembic.config import Config
from app.config import settings


def test_operations_migration_preserves_legacy_tasks(tmp_path, monkeypatch):
    server = Path(__file__).resolve().parents[1]
    url = "sqlite:///" + (tmp_path / "migration.db").as_posix()
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    config = Config(str(server / "alembic.ini"))
    config.set_main_option("script_location", str(server / "alembic"))
    config.attributes["configure_logger"] = False
    engine = create_engine(url)
    from app.models import base

    monkeypatch.setattr(base, "engine", engine)
    base.run_migrations()
    command.downgrade(config, "20261102_0003")
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO tasks (id, title, raw_address, status) VALUES (1, 'Legacy', 'Ленина, 1', 'NEW')"
            )
        )
    command.upgrade(config, "head")
    with engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT version FROM tasks WHERE id=1")
            ).scalar_one()
            == 1
        )
        assert "outbox_events" in inspect(connection).get_table_names()
    command.downgrade(config, "20261102_0003")
    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT title FROM tasks WHERE id=1")).scalar_one()
            == "Legacy"
        )
        assert "outbox_events" not in inspect(connection).get_table_names()
    command.upgrade(config, "head")
    engine.dispose()
