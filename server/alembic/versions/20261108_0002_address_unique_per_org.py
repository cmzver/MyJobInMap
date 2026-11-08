"""Address text unique per organization, not globally.

Таблица addresses заводилась до Alembic (create_all) с уникальным индексом
на одну колонку address. Проверка дубля в API — в пределах организации,
поэтому второй организации, обслуживающей тот же дом, создание адреса падало
на уникальности (500). Теперь уникальность — (organization_id, address), а
для записей без организации — частичный уникальный индекс по address.

Имя старого ограничения зависит от того, как создавалась база, поэтому
одноколоночные уникальные индексы/ограничения на address ищем по факту.

Revision ID: 20261108_0002
Revises: 20261108_0001
Create Date: 2026-11-08
"""

import sqlalchemy as sa

from alembic import op

revision = "20261108_0002"
down_revision = "20261108_0001"
branch_labels = None
depends_on = None

TABLE = "addresses"
NO_ORG = sa.text("organization_id IS NULL")


def _inspector():
    return sa.inspect(op.get_bind())


def upgrade():
    for constraint in _inspector().get_unique_constraints(TABLE):
        if constraint["column_names"] == ["address"] and constraint.get("name"):
            with op.batch_alter_table(TABLE) as batch:
                batch.drop_constraint(constraint["name"], type_="unique")

    has_plain_index = False
    for index in _inspector().get_indexes(TABLE):
        if index["column_names"] != ["address"]:
            continue
        if index.get("unique"):
            op.drop_index(index["name"], table_name=TABLE)
        else:
            has_plain_index = True
    if not has_plain_index:
        op.create_index("ix_addresses_address", TABLE, ["address"])

    op.create_index(
        "uq_addresses_org_address",
        TABLE,
        ["organization_id", "address"],
        unique=True,
    )
    op.create_index(
        "uq_addresses_address_no_org",
        TABLE,
        ["address"],
        unique=True,
        postgresql_where=NO_ORG,
        sqlite_where=NO_ORG,
    )


def downgrade():
    # Не пройдёт, если один адрес уже заведён в нескольких организациях —
    # глобальная уникальность с такими данными невозможна.
    op.drop_index("uq_addresses_address_no_org", table_name=TABLE)
    op.drop_index("uq_addresses_org_address", table_name=TABLE)
    op.drop_index("ix_addresses_address", table_name=TABLE)
    op.create_index("ix_addresses_address", TABLE, ["address"], unique=True)
