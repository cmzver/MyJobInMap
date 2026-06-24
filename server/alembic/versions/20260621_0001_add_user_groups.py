"""Add user_groups table (custom roles registry)

Реестр групп пользователей (ролей) — и встроенных, и созданных администратором.
``name`` — slug, который пишется в ``users.role`` и служит ключом в
``role_permissions``; ``base_access`` задаёт грубый уровень доступа для навигации
портала и coarse-проверок. Встроенные группы (admin/dispatcher/worker) сидятся
здесь же, чтобы матрица прав и выпадающий список ролей были консистентны на
свежей БД до первого вызова init_default_settings.

Revision ID: 20260621_0001
Revises: 20260619_0001
Create Date: 2026-06-21
"""

import sqlalchemy as sa

from alembic import op

revision = "20260621_0001"
down_revision = "20260619_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=20), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "base_access",
            sa.String(length=20),
            nullable=False,
            server_default="worker",
        ),
        sa.Column(
            "is_system",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_groups_id", "user_groups", ["id"])
    op.create_index("ix_user_groups_name", "user_groups", ["name"], unique=True)

    user_groups = sa.table(
        "user_groups",
        sa.column("name", sa.String),
        sa.column("label", sa.String),
        sa.column("description", sa.String),
        sa.column("base_access", sa.String),
        sa.column("is_system", sa.Boolean),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(
        user_groups,
        [
            {
                "name": "admin",
                "label": "Администратор",
                "description": "Полный доступ ко всем функциям",
                "base_access": "admin",
                "is_system": True,
                "sort_order": 1,
            },
            {
                "name": "dispatcher",
                "label": "Диспетчер",
                "description": "Управление заявками и исполнителями",
                "base_access": "dispatcher",
                "is_system": True,
                "sort_order": 2,
            },
            {
                "name": "worker",
                "label": "Работник",
                "description": "Исполнение назначенных заявок",
                "base_access": "worker",
                "is_system": True,
                "sort_order": 3,
            },
        ],
    )


def downgrade():
    op.drop_table("user_groups")
