"""Add planned_date column to tasks

Revision ID: 001_add_planned_date
Revises: 
Create Date: 2025-12-09 23:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "001_add_planned_date"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("planned_date", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "planned_date")
