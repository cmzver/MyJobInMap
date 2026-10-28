"""Add intercom_panels table (network door panels per address)

Сетевые домофонные панели на адресе (например Beward): адрес/идентификация
устройства. Учётные данные в БД не хранятся — только в секретах сервера.

Revision ID: 20260628_0001
Revises: 20260627_0003
Create Date: 2026-06-28
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260628_0001"
down_revision = "20260627_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "intercom_panels",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("address_id", sa.Integer(), nullable=False),
        sa.Column("vendor", sa.String(30), nullable=False, server_default="beward"),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("ip", sa.String(64), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False, server_default="80"),
        sa.Column("entrance", sa.String(10), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["address_id"], ["addresses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_intercom_panels_address_id", "intercom_panels", ["address_id"])


def downgrade():
    op.drop_index("ix_intercom_panels_address_id", table_name="intercom_panels")
    op.drop_table("intercom_panels")
