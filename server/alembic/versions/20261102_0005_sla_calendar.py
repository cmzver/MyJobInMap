"""Рабочий календарь SLA.

Revision ID: 20261102_0005
Revises: 20261102_0004
"""

import sqlalchemy as sa

from alembic import op

revision = "20261102_0005"
down_revision = "20261102_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "sla_calendars",
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("weekdays", sa.JSON(), nullable=False),
        sa.Column("start_time", sa.String(5), nullable=False),
        sa.Column("end_time", sa.String(5), nullable=False),
        sa.Column("excluded_dates", sa.JSON(), nullable=False),
    )


def downgrade():
    op.drop_table("sla_calendars")
