"""Add composite index on notifications (user_id, task_id, is_read)

Revision ID: 20260413_0001
Revises: 20260322_0002
Create Date: 2026-04-13
"""

from alembic import op

revision = "20260413_0001"
down_revision = "20260322_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        "ix_notifications_user_task_read",
        "notifications",
        ["user_id", "task_id", "is_read"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_notifications_user_task_read", table_name="notifications")
