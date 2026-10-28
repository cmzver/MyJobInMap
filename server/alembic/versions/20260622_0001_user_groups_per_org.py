"""User groups & permissions scoped per organization

Делает кастомные группы и их права изолированными по организации:
- ``user_groups.organization_id`` (NULL — встроенные общие admin/dispatcher/worker),
  уникальность имени меняется с глобальной на (organization_id, name);
- ``role_permissions.organization_id`` (NULL — права встроенных ролей) + составной
  индекс под скоуп-лукап в check_permission.

Встроенные группы остаются глобальными (organization_id IS NULL).

Revision ID: 20260622_0001
Revises: 20260621_0001
Create Date: 2026-06-22
"""

import sqlalchemy as sa

from alembic import op

revision = "20260622_0001"
down_revision = "20260621_0001"
branch_labels = None
depends_on = None


def upgrade():
    # --- user_groups: organization_id + (organization_id, name) unique ---
    op.add_column(
        "user_groups", sa.Column("organization_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        "ix_user_groups_organization_id", "user_groups", ["organization_id"]
    )
    # Снимаем глобальную уникальность имени, добавляем уникальность в рамках org.
    op.drop_index("ix_user_groups_name", table_name="user_groups")
    op.create_index("ix_user_groups_name", "user_groups", ["name"])
    op.create_index(
        "uq_user_groups_org_name",
        "user_groups",
        ["organization_id", "name"],
        unique=True,
    )

    # --- role_permissions: organization_id + lookup index ---
    op.add_column(
        "role_permissions", sa.Column("organization_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        "ix_role_permissions_organization_id",
        "role_permissions",
        ["organization_id"],
    )
    op.create_index(
        "ix_role_permissions_lookup",
        "role_permissions",
        ["role", "permission", "organization_id"],
    )


def downgrade():
    op.drop_index("ix_role_permissions_lookup", table_name="role_permissions")
    op.drop_index("ix_role_permissions_organization_id", table_name="role_permissions")
    op.drop_column("role_permissions", "organization_id")

    op.drop_index("uq_user_groups_org_name", table_name="user_groups")
    op.drop_index("ix_user_groups_name", table_name="user_groups")
    op.create_index("ix_user_groups_name", "user_groups", ["name"], unique=True)
    op.drop_index("ix_user_groups_organization_id", table_name="user_groups")
    op.drop_column("user_groups", "organization_id")
