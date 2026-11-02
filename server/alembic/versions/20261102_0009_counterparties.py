"""Counterparties (managing companies) and monthly summary acts.

Контрагенты — УК/ТСЖ как юрлица; объекты привязываются к ним, а сводный акт
за месяц — это акт вида «summary» с контрагентом и месяцем (раздел 7.9 плана).

Revision ID: 20261102_0009
Revises: 20261102_0008
Create Date: 2026-11-02
"""

import sqlalchemy as sa

from alembic import op

revision = "20261102_0009"
down_revision = "20261102_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "counterparties",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("legal_name", sa.String(300), nullable=True),
        sa.Column("inn", sa.String(12), nullable=True),
        sa.Column("kpp", sa.String(9), nullable=True),
        sa.Column("ogrn", sa.String(15), nullable=True),
        sa.Column("legal_address", sa.String(500), nullable=True),
        sa.Column("bank_name", sa.String(200), nullable=True),
        sa.Column("bik", sa.String(9), nullable=True),
        sa.Column("account", sa.String(20), nullable=True),
        sa.Column("corr_account", sa.String(20), nullable=True),
        sa.Column("contract_number", sa.String(100), nullable=True),
        sa.Column("contract_date", sa.String(20), nullable=True),
        sa.Column("signer_name", sa.String(200), nullable=True),
        sa.Column("signer_position", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_counterparties_organization_id", "counterparties", ["organization_id"]
    )

    with op.batch_alter_table("addresses") as batch_op:
        batch_op.add_column(sa.Column("counterparty_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_addresses_counterparty_id",
            "counterparties",
            ["counterparty_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_addresses_counterparty_id", ["counterparty_id"])

    with op.batch_alter_table("acts") as batch_op:
        batch_op.add_column(sa.Column("counterparty_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("period_start", sa.Date(), nullable=True))
        batch_op.create_foreign_key(
            "fk_acts_counterparty_id",
            "counterparties",
            ["counterparty_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_acts_counterparty_id", ["counterparty_id"])


def downgrade():
    with op.batch_alter_table("acts") as batch_op:
        batch_op.drop_index("ix_acts_counterparty_id")
        batch_op.drop_constraint("fk_acts_counterparty_id", type_="foreignkey")
        batch_op.drop_column("period_start")
        batch_op.drop_column("counterparty_id")
    with op.batch_alter_table("addresses") as batch_op:
        batch_op.drop_index("ix_addresses_counterparty_id")
        batch_op.drop_constraint("fk_addresses_counterparty_id", type_="foreignkey")
        batch_op.drop_column("counterparty_id")
    op.drop_index("ix_counterparties_organization_id", table_name="counterparties")
    op.drop_table("counterparties")
