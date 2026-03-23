"""Add support_ticket_id to notifications

Revision ID: 20260322_0002
Revises: 20260322_0001
Create Date: 2026-03-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260322_0002"
down_revision = "20260322_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("notifications", sa.Column("support_ticket_id", sa.Integer(), nullable=True))
    op.create_index("ix_notifications_support_ticket_id", "notifications", ["support_ticket_id"], unique=False)
    op.create_foreign_key(
        "fk_notifications_support_ticket_id_support_tickets",
        "notifications",
        "support_tickets",
        ["support_ticket_id"],
        ["id"],
    )


def downgrade():
    op.drop_constraint("fk_notifications_support_ticket_id_support_tickets", "notifications", type_="foreignkey")
    op.drop_index("ix_notifications_support_ticket_id", table_name="notifications")
    op.drop_column("notifications", "support_ticket_id")
