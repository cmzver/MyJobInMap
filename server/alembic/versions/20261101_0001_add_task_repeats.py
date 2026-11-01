"""Add task repeats: address_key, repeat_of_task_id, repeat_kind.

Повторные заявки и окно повторов в настройках организации; место заявки
(address_key) для истории адреса. Изначально миграция размечала историю
повторов автоматически — с 20261101_0003 повторы отмечают только вручную,
поэтому здесь остался лишь расчёт места.

Revision ID: 20261101_0001
Revises: 20261031_0001
Create Date: 2026-11-01
"""

import sqlalchemy as sa

from alembic import op

revision = "20261101_0001"
down_revision = "20261031_0001"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("organization_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "repeat_window_days",
                sa.Integer(),
                nullable=False,
                server_default="30",
            )
        )

    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("address_key", sa.String(160), nullable=True))
        batch_op.add_column(sa.Column("repeat_of_task_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("repeat_kind", sa.String(16), nullable=True))
        batch_op.create_index(
            "ix_tasks_org_address_key", ["organization_id", "address_key"]
        )
        batch_op.create_index("ix_tasks_repeat_of_task_id", ["repeat_of_task_id"])
        batch_op.create_foreign_key(
            "fk_tasks_repeat_of_task_id",
            "tasks",
            ["repeat_of_task_id"],
            ["id"],
            ondelete="SET NULL",
        )

    _backfill()


def _backfill():
    from app.services.repeat_detector import address_key

    bind = op.get_bind()
    tasks = sa.table(
        "tasks",
        sa.column("id", sa.Integer),
        sa.column("raw_address", sa.String),
        sa.column("address_key", sa.String),
    )
    updates = [
        {"task_id": row.id, "key": key}
        for row in bind.execute(sa.select(tasks.c.id, tasks.c.raw_address))
        if (key := address_key(row.raw_address))
    ]
    if updates:
        bind.execute(
            tasks.update()
            .where(tasks.c.id == sa.bindparam("task_id"))
            .values(address_key=sa.bindparam("key")),
            updates,
        )


def downgrade():
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("fk_tasks_repeat_of_task_id", type_="foreignkey")
        batch_op.drop_index("ix_tasks_repeat_of_task_id")
        batch_op.drop_index("ix_tasks_org_address_key")
        batch_op.drop_column("repeat_kind")
        batch_op.drop_column("repeat_of_task_id")
        batch_op.drop_column("address_key")

    with op.batch_alter_table("organization_settings") as batch_op:
        batch_op.drop_column("repeat_window_days")
