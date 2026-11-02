"""Act material lines installed on the object become address equipment.

Строка-материал акта с отметкой «установлено на объект» при выпуске акта
заводится в оборудование адреса заявки; строка помнит, какую запись
оборудования создала (фаза 4d).

Revision ID: 20261102_0008
Revises: 20261102_0007
Create Date: 2026-11-02
"""

import sqlalchemy as sa

from alembic import op

revision = "20261102_0008"
down_revision = "20261102_0007"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("act_lines") as batch_op:
        batch_op.add_column(
            sa.Column(
                "install_to_object",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch_op.add_column(sa.Column("equipment_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_act_lines_equipment_id",
            "address_equipment",
            ["equipment_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("act_lines") as batch_op:
        batch_op.drop_constraint("fk_act_lines_equipment_id", type_="foreignkey")
        batch_op.drop_column("equipment_id")
        batch_op.drop_column("install_to_object")
