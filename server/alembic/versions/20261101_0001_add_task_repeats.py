"""Add task repeats: address_key, repeat_of_task_id, repeat_kind.

Повторные заявки (дубль открытой, возврат после недавнего закрытия) и окно
повторов в настройках организации. История размечается здесь же тем же
расчётом, что и новые заявки (repeat_detector.pick_repeat относительно
момента создания), — аналитика повторов сразу видит прошлые месяцы.

Revision ID: 20261101_0001
Revises: 20261031_0001
Create Date: 2026-11-01
"""

from collections import defaultdict
from types import SimpleNamespace

import sqlalchemy as sa

from alembic import op

revision = "20261101_0001"
down_revision = "20261031_0001"
branch_labels = None
depends_on = None

# Своего окна у организаций до этой миграции не было.
_WINDOW_DAYS = 30


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
    from app.services.repeat_detector import address_key, pick_repeat

    bind = op.get_bind()
    tasks = sa.table(
        "tasks",
        sa.column("id", sa.Integer),
        sa.column("organization_id", sa.Integer),
        sa.column("raw_address", sa.String),
        sa.column("address_id", sa.Integer),
        sa.column("system_id", sa.Integer),
        sa.column("system_type", sa.String),
        sa.column("defect_type", sa.String),
        sa.column("status", sa.String),
        sa.column("created_at", sa.DateTime),
        sa.column("completed_at", sa.DateTime),
        sa.column("address_key", sa.String),
        sa.column("repeat_of_task_id", sa.Integer),
        sa.column("repeat_kind", sa.String),
    )
    rows = [
        SimpleNamespace(**row._mapping)
        for row in bind.execute(
            sa.select(
                tasks.c.id,
                tasks.c.organization_id,
                tasks.c.raw_address,
                tasks.c.address_id,
                tasks.c.system_id,
                tasks.c.system_type,
                tasks.c.defect_type,
                tasks.c.status,
                tasks.c.created_at,
                tasks.c.completed_at,
            )
        )
    ]
    by_address = defaultdict(list)
    by_key = defaultdict(list)
    for row in rows:
        row.address_key = address_key(row.raw_address)
        if row.address_id is not None:
            by_address[(row.organization_id, row.address_id)].append(row)
        if row.address_key:
            by_key[(row.organization_id, row.address_key)].append(row)

    updates = []
    for row in rows:
        candidates = {
            other.id: other
            for other in by_address.get((row.organization_id, row.address_id), [])
            + by_key.get((row.organization_id, row.address_key), [])
        }
        match = pick_repeat(row, candidates.values(), _WINDOW_DAYS)
        if row.address_key or match:
            updates.append(
                {
                    "task_id": row.id,
                    "key": row.address_key,
                    "repeat_of": match[0].id if match else None,
                    "kind": match[1] if match else None,
                }
            )
    if updates:
        bind.execute(
            tasks.update()
            .where(tasks.c.id == sa.bindparam("task_id"))
            .values(
                address_key=sa.bindparam("key"),
                repeat_of_task_id=sa.bindparam("repeat_of"),
                repeat_kind=sa.bindparam("kind"),
            ),
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
