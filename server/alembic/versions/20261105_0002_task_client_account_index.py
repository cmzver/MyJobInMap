"""Index tasks.client_account_id.

Кабинет клиента ищет заявки контрагента и считает лимит заявок входа по
client_account_id.

Revision ID: 20261105_0002
Revises: 20261105_0001
Create Date: 2026-11-05
"""

from alembic import op

revision = "20261105_0002"
down_revision = "20261105_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_tasks_client_account_id", "tasks", ["client_account_id"])


def downgrade():
    op.drop_index("ix_tasks_client_account_id", table_name="tasks")
