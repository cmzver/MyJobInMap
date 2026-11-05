"""Applicant notifications: task status link, Telegram subscribers, SMS settings.

Ссылка заявителю на страницу статуса заявки, подписки Telegram и настройки
уведомлений организации (docs/client-stock-plan.md, фаза У).

Revision ID: 20261105_0001
Revises: 20261103_0003
Create Date: 2026-11-05
"""

import sqlalchemy as sa

from alembic import op

revision = "20261105_0001"
down_revision = "20261103_0003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("public_token", sa.String(64), nullable=True))
        batch.create_unique_constraint("uq_tasks_public_token", ["public_token"])
    op.create_table(
        "task_subscribers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("address", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("task_id", "channel", "address", name="uq_task_subscriber"),
    )
    op.create_index("ix_task_subscribers_task_id", "task_subscribers", ["task_id"])
    op.create_index("ix_task_subscribers_address", "task_subscribers", ["address"])
    with op.batch_alter_table("organization_settings") as batch:
        batch.add_column(
            sa.Column(
                "notify_telegram_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )
        batch.add_column(
            sa.Column(
                "sms_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        batch.add_column(sa.Column("sms_api_id", sa.String(100), nullable=True))


def downgrade():
    with op.batch_alter_table("organization_settings") as batch:
        batch.drop_column("sms_api_id")
        batch.drop_column("sms_enabled")
        batch.drop_column("notify_telegram_enabled")
    op.drop_index("ix_task_subscribers_address", table_name="task_subscribers")
    op.drop_index("ix_task_subscribers_task_id", table_name="task_subscribers")
    op.drop_table("task_subscribers")
    with op.batch_alter_table("tasks") as batch:
        batch.drop_constraint("uq_tasks_public_token", type_="unique")
        batch.drop_column("public_token")
