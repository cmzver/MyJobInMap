"""Stock: organization warehouse, movement kinds, price list <-> materials.

Склад организации (остаток в materials.warehouse_quantity), минимальный
остаток, вид проводки в журнале и связь строки прайса / строки акта с
позицией склада — по акту материал списывается у исполнителя
(docs/client-stock-plan.md, фазы С1–С2).

Revision ID: 20261103_0002
Revises: 20261103_0001
Create Date: 2026-11-03
"""

import sqlalchemy as sa

from alembic import op

revision = "20261103_0002"
down_revision = "20261103_0001"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("materials") as batch:
        batch.add_column(
            sa.Column(
                "warehouse_quantity",
                sa.Numeric(14, 3),
                nullable=False,
                server_default="0",
            )
        )
        batch.add_column(sa.Column("min_quantity", sa.Numeric(14, 3), nullable=True))

    with op.batch_alter_table("material_movements") as batch:
        batch.add_column(
            sa.Column(
                "kind", sa.String(16), nullable=False, server_default="receipt"
            )
        )
        batch.alter_column(
            "operation_id", type_=sa.String(80), existing_type=sa.String(64)
        )
        batch.create_index("ix_material_movements_created_at", ["created_at"])
    # До склада были только выдача исполнителю (+) и списание (−).
    op.execute("UPDATE material_movements SET kind = 'write_off' WHERE quantity < 0")

    with op.batch_alter_table("service_catalog_items") as batch:
        batch.add_column(sa.Column("material_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_service_catalog_material_id",
            "materials",
            ["material_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("act_lines") as batch:
        batch.add_column(sa.Column("material_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_act_lines_material_id",
            "materials",
            ["material_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("act_lines") as batch:
        batch.drop_constraint("fk_act_lines_material_id", type_="foreignkey")
        batch.drop_column("material_id")
    with op.batch_alter_table("service_catalog_items") as batch:
        batch.drop_constraint("fk_service_catalog_material_id", type_="foreignkey")
        batch.drop_column("material_id")
    with op.batch_alter_table("material_movements") as batch:
        batch.drop_index("ix_material_movements_created_at")
        batch.alter_column(
            "operation_id", type_=sa.String(64), existing_type=sa.String(80)
        )
        batch.drop_column("kind")
    with op.batch_alter_table("materials") as batch:
        batch.drop_column("min_quantity")
        batch.drop_column("warehouse_quantity")
