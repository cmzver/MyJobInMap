"""Суммы заявок и абонплата хранятся точно (Numeric), в API остаются числами."""

from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, text

from alembic import command
from alembic.config import Config
from app.config import settings
from app.models import TaskModel
from app.utils.money import money, to_money


def test_money_rounds_half_up_without_float_tail():
    assert money(0.1 + 0.2) == Decimal("0.30")
    assert money(2.675) == Decimal("2.68")
    assert to_money(None) is None


def test_task_payment_amount_is_exact(client, admin_token, db_session):
    headers = {"Authorization": f"Bearer {admin_token}"}
    created = client.post(
        "/api/tasks",
        json={
            "title": "Платная",
            "address": "Ленина, 5",
            "is_paid": True,
            "payment_amount": 1234.565,
        },
        headers=headers,
    )
    assert created.status_code == 200
    assert created.json()["payment_amount"] == 1234.57

    task = db_session.get(TaskModel, created.json()["id"])
    db_session.refresh(task)
    assert task.payment_amount == Decimal("1234.57")

    updated = client.patch(
        f"/api/admin/tasks/{task.id}",
        json={"payment_amount": 0.1},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["payment_amount"] == 0.1


def test_money_migration_round_trip(tmp_path, monkeypatch):
    server = Path(__file__).resolve().parents[1]
    url = "sqlite:///" + (tmp_path / "money.db").as_posix()
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    config = Config(str(server / "alembic.ini"))
    config.set_main_option("script_location", str(server / "alembic"))
    config.attributes["configure_logger"] = False
    engine = create_engine(url)
    from app.models import base

    monkeypatch.setattr(base, "engine", engine)
    base.run_migrations()
    command.downgrade(config, "20261102_0009")
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO tasks (id, title, raw_address, status, payment_amount)"
                " VALUES (1, 'Старая', 'Ленина, 1', 'DONE', 1500.5)"
            )
        )
    command.upgrade(config, "head")
    with engine.connect() as connection:
        value = connection.execute(
            text("SELECT payment_amount FROM tasks WHERE id=1")
        ).scalar_one()
    assert Decimal(str(value)) == Decimal("1500.5")
    command.downgrade(config, "20261102_0009")
    command.upgrade(config, "head")
    engine.dispose()
