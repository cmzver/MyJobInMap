"""Intercom actions linked to a task: remote resolution from the task card.

Действие с панелью (открыть дверь, код записи ключей), сделанное из карточки
заявки, помнит заявку — в её истории видно, что и как сделали удалённо
(фаза 3).

Revision ID: 20261102_0007
Revises: 20261102_0006
Create Date: 2026-11-02
"""

import sqlalchemy as sa

from alembic import op

revision = "20261102_0007"
down_revision = "20261102_0006"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("intercom_actions") as batch_op:
        batch_op.add_column(sa.Column("task_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_intercom_actions_task_id",
            "tasks",
            ["task_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_intercom_actions_task_id", ["task_id"])


def downgrade():
    with op.batch_alter_table("intercom_actions") as batch_op:
        batch_op.drop_index("ix_intercom_actions_task_id")
        batch_op.drop_constraint("fk_intercom_actions_task_id", type_="foreignkey")
        batch_op.drop_column("task_id")
