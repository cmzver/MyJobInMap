"""Add tasks.address_id (link task -> address book)

Привязка заявки к адресу из книги. Заполняется при создании, если адрес
сматчился (TaskService.resolve_coordinates). Нужна, чтобы правка координат
адреса автоматически подхватывалась привязанными заявками. NULL — адрес не
найден, координаты получены геокодером.

Revision ID: 20260630_0001
Revises: 20260628_0003
Create Date: 2026-06-30
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260630_0001"
down_revision = "20260628_0003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("address_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_tasks_address_id", ["address_id"])
        batch_op.create_foreign_key(
            "fk_tasks_address_id",
            "addresses",
            ["address_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("fk_tasks_address_id", type_="foreignkey")
        batch_op.drop_index("ix_tasks_address_id")
        batch_op.drop_column("address_id")
