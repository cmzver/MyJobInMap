"""Add notifications.conversation_id (chat mention deep-link)

Мягкая ссылка на чат для уведомлений-упоминаний (без FK — чат можно удалить).

Revision ID: 20260627_0003
Revises: 20260627_0002
Create Date: 2026-06-27
"""

import sqlalchemy as sa
from alembic import op

revision = "20260627_0003"
down_revision = "20260627_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "notifications",
        sa.Column("conversation_id", sa.Integer(), nullable=True),
    )


def downgrade():
    op.drop_column("notifications", "conversation_id")
