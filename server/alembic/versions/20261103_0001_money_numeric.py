"""Money columns Float -> Numeric(12, 2).

Сумма заявки и абонплата системы считаются деньгами (сводный акт, финансы),
поэтому хранятся точно, с копейками. Значения округляются при переводе.

Revision ID: 20261103_0001
Revises: 20261102_0009
Create Date: 2026-11-03
"""

import sqlalchemy as sa

from alembic import op

revision = "20261103_0001"
down_revision = "20261102_0009"
branch_labels = None
depends_on = None

_COLUMNS = (("tasks", "payment_amount"), ("address_systems", "monthly_cost"))


def _alter(table: str, column: str, new_type, old_type, using: str) -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column(
            table,
            column,
            type_=new_type,
            existing_type=old_type,
            existing_nullable=True,
            postgresql_using=using,
        )
    else:
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                column, type_=new_type, existing_type=old_type, existing_nullable=True
            )


def upgrade():
    postgres = op.get_bind().dialect.name == "postgresql"
    for table, column in _COLUMNS:
        if not postgres:
            # SQLite при смене типа значения не трогает — округляем явно. В
            # PostgreSQL round(double, int) нет: там округляет USING ниже.
            op.execute(
                f"UPDATE {table} SET {column} = round({column}, 2)"
                f" WHERE {column} IS NOT NULL"
            )
        _alter(
            table,
            column,
            sa.Numeric(12, 2),
            sa.Float(),
            f"round({column}::numeric, 2)",
        )


def downgrade():
    for table, column in _COLUMNS:
        _alter(
            table,
            column,
            sa.Float(),
            sa.Numeric(12, 2),
            f"{column}::double precision",
        )
