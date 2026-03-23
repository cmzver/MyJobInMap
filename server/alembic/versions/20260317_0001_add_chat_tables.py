"""Add chat tables: conversations, members, messages, attachments, reactions, mentions

Revision ID: 20260317_0001
Revises: 20260217_0001
Create Date: 2026-03-17

Chat system: 6 новых таблиц для полноценного мессенджера.
- conversations — комнаты чата (task, direct, group, org_general)
- conversation_members — участники с ролями и настройками
- messages — сообщения с reply, soft delete, edit tracking
- message_attachments — файлы/фото к сообщениям
- message_reactions — emoji реакции
- message_mentions — @упоминания пользователей
"""

import sqlalchemy as sa

from alembic import op

revision = "20260317_0001"
down_revision = "20260217_0001"
branch_labels = None
depends_on = None


def upgrade():
    # 1. conversations
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.UniqueConstraint("type", "task_id", name="uq_conversation_task"),
    )
    op.create_index("ix_conversations_id", "conversations", ["id"])
    op.create_index("ix_conversations_org", "conversations", ["organization_id"])
    op.create_index("ix_conversations_type", "conversations", ["type"])
    op.create_index(
        "ix_conversations_task_id", "conversations", ["task_id"], unique=True
    )

    # 2. conversation_members
    op.create_table(
        "conversation_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(20), server_default="member"),
        sa.Column("last_read_message_id", sa.Integer(), nullable=True),
        sa.Column("is_muted", sa.Boolean(), server_default="0"),
        sa.Column("is_archived", sa.Boolean(), server_default="0"),
        sa.Column("joined_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["conversations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_conv_member"),
    )
    op.create_index("ix_conv_members_id", "conversation_members", ["id"])
    op.create_index("ix_conv_members_user", "conversation_members", ["user_id"])

    # 3. messages
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("message_type", sa.String(20), server_default="text"),
        sa.Column("reply_to_id", sa.Integer(), nullable=True),
        sa.Column("is_edited", sa.Boolean(), server_default="0"),
        sa.Column("edited_at", sa.DateTime(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["conversations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["reply_to_id"], ["messages.id"]),
    )
    op.create_index("ix_messages_id", "messages", ["id"])
    op.create_index(
        "ix_messages_conv_created", "messages", ["conversation_id", "created_at"]
    )
    op.create_index("ix_messages_sender", "messages", ["sender_id"])

    # 4. message_attachments
    op.create_table(
        "message_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_size", sa.Integer(), server_default="0"),
        sa.Column(
            "mime_type", sa.String(100), server_default="application/octet-stream"
        ),
        sa.Column("thumbnail_path", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_msg_attachments_id", "message_attachments", ["id"])
    op.create_index("ix_msg_attachments_message", "message_attachments", ["message_id"])

    # 5. message_reactions
    op.create_table(
        "message_reactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("emoji", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("message_id", "user_id", "emoji", name="uq_reaction"),
    )
    op.create_index("ix_reactions_id", "message_reactions", ["id"])
    op.create_index("ix_reactions_message", "message_reactions", ["message_id"])

    # 6. message_mentions
    op.create_table(
        "message_mentions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("offset", sa.Integer(), server_default="0"),
        sa.Column("length", sa.Integer(), server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("ix_mentions_id", "message_mentions", ["id"])
    op.create_index("ix_mentions_message", "message_mentions", ["message_id"])
    op.create_index("ix_mentions_user", "message_mentions", ["user_id"])


def downgrade():
    op.drop_table("message_mentions")
    op.drop_table("message_reactions")
    op.drop_table("message_attachments")
    op.drop_table("messages")
    op.drop_table("conversation_members")
    op.drop_table("conversations")
