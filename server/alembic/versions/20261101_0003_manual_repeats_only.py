"""Repeats are marked manually only: clear automatic returns.

Автоматические возвраты путали разные квартиры, поломки и одноимённые адреса
в соседних посёлках. Повтор и дубль теперь отмечает диспетчер в карточке
заявки; всё, что поставила автоматика (возвраты), снимаем. Дубли к этому
моменту уже ставятся только вручную — их не трогаем.

Revision ID: 20261101_0003
Revises: 20261101_0002
Create Date: 2026-11-01
"""

import sqlalchemy as sa

from alembic import op

revision = "20261101_0003"
down_revision = "20261101_0002"
branch_labels = None
depends_on = None


def upgrade():
    tasks = sa.table(
        "tasks",
        sa.column("repeat_of_task_id", sa.Integer),
        sa.column("repeat_kind", sa.String),
    )
    op.execute(
        tasks.update()
        .where(tasks.c.repeat_kind == "return")
        .values(repeat_of_task_id=None, repeat_kind=None)
    )


def downgrade():
    # Автоматические возвраты не восстанавливаем — их больше не ставит и код.
    pass
