"""Add task creator reference

Revision ID: 20260701_0001
Revises: 20260630_0001
Create Date: 2026-07-01
"""

import sqlalchemy as sa

from alembic import op


revision = "20260701_0001"
down_revision = "20260630_0001"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("created_by_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_tasks_created_by_id", ["created_by_id"])
        batch_op.create_foreign_key(
            "fk_tasks_created_by_id",
            "users",
            ["created_by_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("fk_tasks_created_by_id", type_="foreignkey")
        batch_op.drop_index("ix_tasks_created_by_id")
        batch_op.drop_column("created_by_id")
