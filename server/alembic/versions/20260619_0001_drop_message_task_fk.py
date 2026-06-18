"""Drop FK constraint on messages.task_id (make it a soft reference)

Прикреплённая к сообщению заявка — мягкая ссылка: после удаления заявки
``messages.task_id`` остаётся «висячим», а превью в чате резолвится как
accessible=false (см. MessageModel). Настоящий FK ломает этот сценарий на
PostgreSQL (запрещает удаление заявки), поэтому констрейнт снимаем. Колонка и
индекс ``ix_messages_task`` сохраняются.

На SQLite внешние ключи не enforce'ятся, а batch-пересборка таблицы ради
снятия безымянного/неизвестного FK хрупка — поэтому там миграция no-op
(дизайн на dangling-ссылке уже работает).

Revision ID: 20260619_0001
Revises: 20260604_0001
Create Date: 2026-06-19
"""

from sqlalchemy import inspect

from alembic import op

revision = "20260619_0001"
down_revision = "20260604_0001"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    # Снимаем FK на messages.task_id по факту наличия, не завязываясь на имя
    # (оно различается: fk_messages_task для Alembic-сборки и
    # messages_task_id_fkey для create_all). No-op, если FK уже нет.
    inspector = inspect(bind)
    for fk in inspector.get_foreign_keys("messages"):
        if fk.get("constrained_columns") == ["task_id"] and fk.get("name"):
            op.drop_constraint(fk["name"], "messages", type_="foreignkey")


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    inspector = inspect(bind)
    existing = {
        tuple(fk.get("constrained_columns") or [])
        for fk in inspector.get_foreign_keys("messages")
    }
    if ("task_id",) not in existing:
        op.create_foreign_key(
            "fk_messages_task", "messages", "tasks", ["task_id"], ["id"]
        )
