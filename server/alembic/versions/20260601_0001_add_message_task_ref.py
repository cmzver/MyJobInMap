"""Add task_id reference to messages (attach Task as a chat message card)

Revision ID: 20260601_0001
Revises: 20260413_0001
Create Date: 2026-06-01
"""

import sqlalchemy as sa
from alembic import op

revision = "20260601_0001"
down_revision = "20260413_0001"
branch_labels = None
depends_on = None


def upgrade():
    # SQLite не умеет ALTER ADD CONSTRAINT — используем batch_alter_table.
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.add_column(sa.Column("task_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_messages_task", "tasks", ["task_id"], ["id"]
        )
        batch_op.create_index("ix_messages_task", ["task_id"], unique=False)


def downgrade():
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.drop_index("ix_messages_task")
        batch_op.drop_constraint("fk_messages_task", type_="foreignkey")
        batch_op.drop_column("task_id")
