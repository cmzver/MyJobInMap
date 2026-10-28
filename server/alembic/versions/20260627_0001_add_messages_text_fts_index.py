"""Add full-text GIN index on messages.text (PostgreSQL only)

Ускоряет поиск по сообщениям (per-conversation и глобальный) на больших
объёмах. Выражение индекса совпадает с фильтром в chat_service._message_text_match
(``to_tsvector('russian', coalesce(text, ''))``), иначе индекс не используется.
На SQLite (локалка/тесты) поиск идёт через ILIKE — индекс не нужен и не создаётся.

Revision ID: 20260627_0001
Revises: 20260625_0001
Create Date: 2026-06-27
"""

from alembic import op

revision = "20260627_0001"
down_revision = "20260625_0001"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_messages_text_fts "
            "ON messages USING gin (to_tsvector('russian', coalesce(text, '')))"
        )


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_messages_text_fts")
