"""Address district and FIAS house id.

Район и код дома ФИАС из справочника DaData: сервер заполняет их при
создании адреса и смене его текста (scripts/backfill_address_district.py —
для уже заведённых).

Revision ID: 20261108_0001
Revises: 20261105_0002
Create Date: 2026-11-08
"""

import sqlalchemy as sa

from alembic import op

revision = "20261108_0001"
down_revision = "20261105_0002"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("addresses") as batch:
        batch.add_column(sa.Column("district", sa.String(length=100), nullable=True))
        batch.add_column(sa.Column("fias_id", sa.String(length=36), nullable=True))
    op.create_index("ix_addresses_fias_id", "addresses", ["fias_id"])


def downgrade():
    op.drop_index("ix_addresses_fias_id", table_name="addresses")
    with op.batch_alter_table("addresses") as batch:
        batch.drop_column("fias_id")
        batch.drop_column("district")
