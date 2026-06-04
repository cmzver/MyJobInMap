"""Add IP security tables (blocked_ips, ip_allowlist, ip_security_events)

Revision ID: 20260604_0001
Revises: 20260601_0001
Create Date: 2026-06-04
"""

import sqlalchemy as sa
from alembic import op

revision = "20260604_0001"
down_revision = "20260601_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "blocked_ips",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("is_manual", sa.Boolean(), nullable=True),
        sa.Column("is_permanent", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=True),
        sa.Column("last_hit_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(length=100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_blocked_ips_id", "blocked_ips", ["id"])
    op.create_index("ix_blocked_ips_ip_address", "blocked_ips", ["ip_address"], unique=True)
    op.create_index("ix_blocked_ips_created_at", "blocked_ips", ["created_at"])
    op.create_index("ix_blocked_ips_expires_at", "blocked_ips", ["expires_at"])

    op.create_table(
        "ip_allowlist",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(length=100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ip_allowlist_id", "ip_allowlist", ["id"])
    op.create_index("ix_ip_allowlist_ip_address", "ip_allowlist", ["ip_address"], unique=True)

    op.create_table(
        "ip_security_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("username", sa.String(length=150), nullable=True),
        sa.Column("detail", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ip_security_events_id", "ip_security_events", ["id"])
    op.create_index("ix_ip_security_events_ip_address", "ip_security_events", ["ip_address"])
    op.create_index("ix_ip_security_events_event_type", "ip_security_events", ["event_type"])
    op.create_index("ix_ip_security_events_created_at", "ip_security_events", ["created_at"])


def downgrade():
    op.drop_table("ip_security_events")
    op.drop_table("ip_allowlist")
    op.drop_table("blocked_ips")
