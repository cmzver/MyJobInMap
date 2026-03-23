"""Add support tickets table

Revision ID: 20260322_0001
Revises: 20260319_0001
Create Date: 2026-03-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260322_0001"
down_revision = "20260319_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False, server_default="feedback"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("admin_response", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_support_tickets_id", "support_tickets", ["id"], unique=False)
    op.create_index("ix_support_tickets_created_by_id", "support_tickets", ["created_by_id"], unique=False)
    op.create_index("ix_support_tickets_category", "support_tickets", ["category"], unique=False)
    op.create_index("ix_support_tickets_status", "support_tickets", ["status"], unique=False)
    op.create_index("ix_support_tickets_organization_id", "support_tickets", ["organization_id"], unique=False)
    op.create_index("ix_support_tickets_organization_status", "support_tickets", ["organization_id", "status"], unique=False)
    op.create_index("ix_support_tickets_updated_at", "support_tickets", ["updated_at"], unique=False)
    op.create_table(
        "support_ticket_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("comment_type", sa.String(length=20), nullable=False, server_default="comment"),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("old_status", sa.String(length=20), nullable=True),
        sa.Column("new_status", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_support_ticket_comments_id", "support_ticket_comments", ["id"], unique=False)
    op.create_index("ix_support_ticket_comments_ticket_id", "support_ticket_comments", ["ticket_id"], unique=False)
    op.create_index("ix_support_ticket_comments_created_at", "support_ticket_comments", ["created_at"], unique=False)
    op.create_index("ix_support_ticket_comments_type", "support_ticket_comments", ["comment_type"], unique=False)


def downgrade():
    op.drop_index("ix_support_ticket_comments_type", table_name="support_ticket_comments")
    op.drop_index("ix_support_ticket_comments_created_at", table_name="support_ticket_comments")
    op.drop_index("ix_support_ticket_comments_ticket_id", table_name="support_ticket_comments")
    op.drop_index("ix_support_ticket_comments_id", table_name="support_ticket_comments")
    op.drop_table("support_ticket_comments")
    op.drop_index("ix_support_tickets_updated_at", table_name="support_tickets")
    op.drop_index("ix_support_tickets_organization_status", table_name="support_tickets")
    op.drop_index("ix_support_tickets_organization_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_status", table_name="support_tickets")
    op.drop_index("ix_support_tickets_category", table_name="support_tickets")
    op.drop_index("ix_support_tickets_created_by_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_id", table_name="support_tickets")
    op.drop_table("support_tickets")
