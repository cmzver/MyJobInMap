"""Add intercom_actions table (audit trail for panel actions)

Журнал действий с домофонными панелями (открытие/закрытие/чтение статуса).
Переживает удаление панели (panel_id -> SET NULL).

Revision ID: 20260628_0002
Revises: 20260628_0001
Create Date: 2026-06-28
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260628_0002"
down_revision = "20260628_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "intercom_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("panel_id", sa.Integer(), nullable=True),
        sa.Column("address_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("detail", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["panel_id"], ["intercom_panels.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["address_id"], ["addresses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_intercom_actions_panel_id", "intercom_actions", ["panel_id"])
    op.create_index(
        "ix_intercom_actions_created_at", "intercom_actions", ["created_at"]
    )


def downgrade():
    op.drop_index("ix_intercom_actions_created_at", table_name="intercom_actions")
    op.drop_index("ix_intercom_actions_panel_id", table_name="intercom_actions")
    op.drop_table("intercom_actions")
