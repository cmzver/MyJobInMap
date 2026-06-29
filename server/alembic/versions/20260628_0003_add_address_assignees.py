"""Add address_assignees table (per-user address access)

Привязка адрес→пользователь для раздела «Мои адреса». Адрес виден сотруднику,
только если он назначен (или пользователь — менеджер/admin). Назначение делают
admin/dispatcher из портала.

Revision ID: 20260628_0003
Revises: 20260628_0002
Create Date: 2026-06-28
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260628_0003"
down_revision = "20260628_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "address_assignees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("address_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["address_id"], ["addresses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_address_assignees_address_user",
        "address_assignees",
        ["address_id", "user_id"],
        unique=True,
    )
    op.create_index(
        "ix_address_assignees_user_id", "address_assignees", ["user_id"]
    )


def downgrade():
    op.drop_index(
        "ix_address_assignees_user_id", table_name="address_assignees"
    )
    op.drop_index(
        "ix_address_assignees_address_user", table_name="address_assignees"
    )
    op.drop_table("address_assignees")
