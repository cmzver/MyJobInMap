"""Act public link: the customer signs later or downloads the PDF.

Ссылка для клиента без входа (фаза 4c): в БД — только хеш токена и срок;
IP подписавшего по ссылке; индекс номера акта — для страницы проверки
подлинности, где номер ищут без организации.

Revision ID: 20261102_0006
Revises: 20261102_0005
Create Date: 2026-11-02
"""

import sqlalchemy as sa

from alembic import op

revision = "20261102_0006"
down_revision = "20261102_0005"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("acts") as batch_op:
        batch_op.add_column(
            sa.Column("public_token_hash", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("public_link_expires_at", sa.DateTime(), nullable=True)
        )
        batch_op.add_column(sa.Column("sign_ip", sa.String(length=64), nullable=True))
        batch_op.create_index(
            "ix_acts_public_token_hash", ["public_token_hash"], unique=True
        )
        batch_op.create_index("ix_acts_number", ["number"])


def downgrade():
    with op.batch_alter_table("acts") as batch_op:
        batch_op.drop_index("ix_acts_number")
        batch_op.drop_index("ix_acts_public_token_hash")
        for column in ("sign_ip", "public_link_expires_at", "public_token_hash"):
            batch_op.drop_column(column)
