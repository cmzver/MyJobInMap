"""Client cabinet accounts for counterparties.

Входы в кабинет клиента для представителей контрагента (УК/ТСЖ) и отметка
заявки, поданной из кабинета (docs/client-stock-plan.md, фаза К1).

Revision ID: 20261103_0003
Revises: 20261103_0002
Create Date: 2026-11-03
"""

import sqlalchemy as sa

from alembic import op

revision = "20261103_0003"
down_revision = "20261103_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "client_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "counterparty_id",
            sa.Integer(),
            sa.ForeignKey("counterparties.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("login", sa.String(100), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(200), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("position", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_client_accounts_organization_id", "client_accounts", ["organization_id"]
    )
    op.create_index(
        "ix_client_accounts_counterparty_id", "client_accounts", ["counterparty_id"]
    )
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("client_account_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_tasks_client_account_id",
            "client_accounts",
            ["client_account_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("tasks") as batch:
        batch.drop_constraint("fk_tasks_client_account_id", type_="foreignkey")
        batch.drop_column("client_account_id")
    op.drop_index("ix_client_accounts_counterparty_id", table_name="client_accounts")
    op.drop_index("ix_client_accounts_organization_id", table_name="client_accounts")
    op.drop_table("client_accounts")
