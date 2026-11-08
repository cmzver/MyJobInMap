"""Миграции этапа «склад, кабинет, уведомления» — вверх и вниз, с данными.

На пустой БД run_migrations() создаёт схему из metadata и ставит head, сами
миграции при этом не выполняются. Тест откатывает их и накатывает заново —
на SQLite и, если задан TEST_DATABASE_URL с PostgreSQL (CI), на отдельной
временной базе PostgreSQL: там проверяются ALTER ... USING и именованные
ограничения так, как они пойдут на прод.
"""

import os
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from alembic import command
from alembic.config import Config
from app.config import settings

BASE_REVISION = "20261102_0009"
SERVER = Path(__file__).resolve().parents[1]


def _postgres_admin_url():
    raw = os.environ.get("TEST_DATABASE_URL", "")
    if not raw.startswith("postgresql"):
        return None
    return make_url(raw)


@pytest.fixture(params=["sqlite", "postgresql"])
def database_url(request, tmp_path):
    if request.param == "sqlite":
        yield "sqlite:///" + (tmp_path / "roundtrip.db").as_posix()
        return
    admin_url = _postgres_admin_url()
    if admin_url is None:
        pytest.skip("TEST_DATABASE_URL не PostgreSQL")
    import psycopg2
    from psycopg2 import sql

    name = f"fieldworker_migrations_{uuid4().hex[:12]}"
    admin = psycopg2.connect(
        host=admin_url.host,
        port=admin_url.port or 5432,
        user=admin_url.username,
        password=admin_url.password,
        dbname="postgres",
    )
    admin.autocommit = True
    with admin.cursor() as cursor:
        cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    try:
        yield admin_url.set(database=name).render_as_string(hide_password=False)
    finally:
        with admin.cursor() as cursor:
            cursor.execute(
                sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                    sql.Identifier(name)
                )
            )
        admin.close()


def test_stage_migrations_down_and_up_with_data(database_url, monkeypatch):
    monkeypatch.setattr(settings, "DATABASE_URL", database_url)
    config = Config(str(SERVER / "alembic.ini"))
    config.set_main_option("script_location", str(SERVER / "alembic"))
    config.attributes["configure_logger"] = False
    engine = create_engine(database_url)
    from app.models import base

    monkeypatch.setattr(base, "engine", engine)
    try:
        base.run_migrations()
        command.downgrade(config, BASE_REVISION)
        with engine.begin() as connection:
            assert "client_accounts" not in inspect(connection).get_table_names()
            connection.execute(
                text(
                    "INSERT INTO tasks (id, title, raw_address, status, version,"
                    " payment_amount) VALUES (1, 'Старая', 'Ленина, 1', 'DONE', 1,"
                    " 1500.555)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO materials (id, name, unit, unit_cost, active)"
                    " VALUES (1, 'Кабель', 'м', 10, :yes)"
                ),
                {"yes": True},
            )
            connection.execute(
                text(
                    "INSERT INTO material_movements (material_id, quantity, unit_cost,"
                    " reason, operation_id, created_at)"
                    " VALUES (1, -2, 10, '', 'old-write-off', CURRENT_TIMESTAMP)"
                )
            )

        command.upgrade(config, "head")
        with engine.connect() as connection:
            amount = connection.execute(
                text("SELECT payment_amount FROM tasks WHERE id = 1")
            ).scalar_one()
            assert Decimal(str(amount)) == Decimal("1500.56")
            kind = connection.execute(
                text("SELECT kind FROM material_movements")
            ).scalar_one()
            assert kind == "write_off"
            tables = set(inspect(connection).get_table_names())
            assert {"client_accounts", "task_subscribers"} <= tables

        # До 20261108_0002 адрес был уникален во всей базе (индекс на address);
        # после — в пределах организации: тот же дом у двух организаций.
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO organizations (id, name, slug, is_active, max_users,"
                    " max_tasks) VALUES (1, 'Первая', 'first', :yes, 50, 100),"
                    " (2, 'Вторая', 'second', :yes, 50, 100)"
                ),
                {"yes": True},
            )
            for org_id in (1, 2):
                connection.execute(
                    text(
                        "INSERT INTO addresses (address, organization_id, lat, lon,"
                        " is_active) VALUES ('Ленина, 1', :org, 0, 0, :yes)"
                    ),
                    {"org": org_id, "yes": True},
                )
        with pytest.raises(Exception):
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "INSERT INTO addresses (address, organization_id, lat, lon,"
                        " is_active) VALUES ('Ленина, 1', 1, 0, 0, :yes)"
                    ),
                    {"yes": True},
                )
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM addresses"))
            connection.execute(text("DELETE FROM organizations"))

        # Повторный цикл: downgrade чистит всё, что добавил upgrade
        command.downgrade(config, BASE_REVISION)
        command.upgrade(config, "head")
    finally:
        engine.dispose()
