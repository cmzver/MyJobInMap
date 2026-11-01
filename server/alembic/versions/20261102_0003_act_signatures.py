"""Act signatures: signed on the worker's phone or refused.

Подпись клиента и мастера на экране телефона (PNG), траектория росчерка,
место и устройство, причина отказа от подписи (фаза 4b).

Revision ID: 20261102_0003
Revises: 20261102_0002
Create Date: 2026-11-02
"""

import sqlalchemy as sa

from alembic import op

revision = "20261102_0003"
down_revision = "20261102_0002"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("acts") as batch_op:
        batch_op.add_column(
            sa.Column("customer_signature_file", sa.String(length=255), nullable=True)
        )
        batch_op.add_column(
            sa.Column("worker_signature_file", sa.String(length=255), nullable=True)
        )
        batch_op.add_column(sa.Column("signature_strokes", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("sign_lat", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("sign_lon", sa.Float(), nullable=True))
        batch_op.add_column(
            sa.Column("sign_device", sa.String(length=100), nullable=True)
        )
        batch_op.add_column(
            sa.Column("refusal_reason", sa.String(length=500), nullable=True)
        )


def downgrade():
    with op.batch_alter_table("acts") as batch_op:
        for column in (
            "refusal_reason",
            "sign_device",
            "sign_lon",
            "sign_lat",
            "signature_strokes",
            "worker_signature_file",
            "customer_signature_file",
        ):
            batch_op.drop_column(column)
