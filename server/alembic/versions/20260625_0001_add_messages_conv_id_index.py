"""Add composite index on messages (conversation_id, id)

Закрывает горячие чат-запросы: cursor-пагинацию (id < before_id ORDER BY id),
last-message per-conversation (max(id)) и unread-диапазоны (id > last_read).

Revision ID: 20260625_0001
Revises: 20260622_0001
Create Date: 2026-06-25
"""

from alembic import op

revision = "20260625_0001"
down_revision = "20260622_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        "ix_messages_conv_id",
        "messages",
        ["conversation_id", "id"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_messages_conv_id", table_name="messages")
