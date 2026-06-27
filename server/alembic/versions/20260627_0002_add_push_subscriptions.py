"""Add push_subscriptions table (Web Push / VAPID)

Браузерные push-подписки портала (Push API). Отдельно от devices (FCM/Android).

Revision ID: 20260627_0002
Revises: 20260627_0001
Create Date: 2026-06-27
"""

import sqlalchemy as sa
from alembic import op

revision = "20260627_0002"
down_revision = "20260627_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
    )
    op.create_index(
        "ix_push_subscriptions_user_id",
        "push_subscriptions",
        ["user_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(
        "ix_push_subscriptions_user_id", table_name="push_subscriptions"
    )
    op.drop_table("push_subscriptions")
