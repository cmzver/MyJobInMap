"""Clear automatically detected duplicates.

Дубли теперь отмечает диспетчер вручную: автоматика путала разные квартиры
и разные поломки в одном доме. Снимаем все отметки «дубль», поставленные
миграцией 20261101_0001 и при создании заявок, а этим заявкам заново ищем
возврат (раньше дубль его перекрывал).

Revision ID: 20261101_0002
Revises: 20261101_0001
Create Date: 2026-11-01
"""

from collections import defaultdict
from types import SimpleNamespace

import sqlalchemy as sa

from alembic import op

revision = "20261101_0002"
down_revision = "20261101_0001"
branch_labels = None
depends_on = None

_DEFAULT_WINDOW_DAYS = 30


def upgrade():
    from app.services.repeat_detector import pick_repeat

    bind = op.get_bind()
    tasks = sa.table(
        "tasks",
        sa.column("id", sa.Integer),
        sa.column("organization_id", sa.Integer),
        sa.column("raw_address", sa.String),
        sa.column("address_id", sa.Integer),
        sa.column("address_key", sa.String),
        sa.column("system_id", sa.Integer),
        sa.column("system_type", sa.String),
        sa.column("defect_type", sa.String),
        sa.column("status", sa.String),
        sa.column("created_at", sa.DateTime),
        sa.column("completed_at", sa.DateTime),
        sa.column("repeat_of_task_id", sa.Integer),
        sa.column("repeat_kind", sa.String),
    )
    settings = sa.table(
        "organization_settings",
        sa.column("organization_id", sa.Integer),
        sa.column("repeat_window_days", sa.Integer),
    )
    windows = dict(
        bind.execute(
            sa.select(settings.c.organization_id, settings.c.repeat_window_days)
        ).fetchall()
    )
    rows = [
        SimpleNamespace(**row._mapping)
        for row in bind.execute(
            sa.select(
                tasks.c.id,
                tasks.c.organization_id,
                tasks.c.raw_address,
                tasks.c.address_id,
                tasks.c.address_key,
                tasks.c.system_id,
                tasks.c.system_type,
                tasks.c.defect_type,
                tasks.c.status,
                tasks.c.created_at,
                tasks.c.completed_at,
                tasks.c.repeat_kind,
            )
        )
    ]
    by_address = defaultdict(list)
    by_key = defaultdict(list)
    for row in rows:
        if row.address_id is not None:
            by_address[(row.organization_id, row.address_id)].append(row)
        if row.address_key:
            by_key[(row.organization_id, row.address_key)].append(row)

    updates = []
    for row in rows:
        if row.repeat_kind != "duplicate":
            continue
        candidates = {
            other.id: other
            for other in by_address.get((row.organization_id, row.address_id), [])
            + by_key.get((row.organization_id, row.address_key), [])
        }
        window = windows.get(row.organization_id) or _DEFAULT_WINDOW_DAYS
        match = pick_repeat(row, candidates.values(), window)
        updates.append(
            {
                "task_id": row.id,
                "repeat_of": match[0].id if match else None,
                "kind": match[1] if match else None,
            }
        )
    if updates:
        bind.execute(
            tasks.update()
            .where(tasks.c.id == sa.bindparam("task_id"))
            .values(
                repeat_of_task_id=sa.bindparam("repeat_of"),
                repeat_kind=sa.bindparam("kind"),
            ),
            updates,
        )


def downgrade():
    # Автоматические дубли не восстанавливаем — их больше не ставит и код.
    pass
