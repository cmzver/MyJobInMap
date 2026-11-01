"""Add acts: service catalog, acts, act lines, act counters; act permissions;
act template and logo in organization settings.

Акты выполненных работ (фаза 4a). Права view_acts/create_acts/manage_acts
встроенным ролям заводятся здесь: засев прав в коде срабатывает только на
пустой базе или со страницы настроек, а на проде права должны появиться сразу.
Кастомным группам строк не добавляем — нет строки, значит запрещено.

Revision ID: 20261102_0002
Revises: 20261102_0001
Create Date: 2026-11-02
"""

import sqlalchemy as sa

from alembic import op

revision = "20261102_0002"
down_revision = "20261102_0001"
branch_labels = None
depends_on = None

_PERMISSIONS = [
    ("admin", "view_acts", True),
    ("admin", "create_acts", True),
    ("admin", "manage_acts", True),
    ("dispatcher", "view_acts", True),
    ("dispatcher", "create_acts", True),
    ("dispatcher", "manage_acts", True),
    ("worker", "view_acts", True),
    ("worker", "create_acts", True),
    ("worker", "manage_acts", False),
]


def upgrade():
    with op.batch_alter_table("organization_settings") as batch_op:
        batch_op.add_column(sa.Column("act_template", sa.JSON(), nullable=True))
        batch_op.add_column(
            sa.Column("act_logo_file", sa.String(length=255), nullable=True)
        )

    op.create_table(
        "service_catalog_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("line_type", sa.String(length=16), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("system_type", sa.String(length=50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_service_catalog_org_active",
        "service_catalog_items",
        ["organization_id", "is_active"],
    )

    op.create_table(
        "acts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("number", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("signed_via", sa.String(length=16), nullable=True),
        sa.Column("signed_at", sa.DateTime(), nullable=True),
        sa.Column("scan_file", sa.String(length=255), nullable=True),
        sa.Column("customer_name", sa.String(length=200), nullable=True),
        sa.Column("customer_role", sa.String(length=20), nullable=True),
        sa.Column("customer_phone", sa.String(length=50), nullable=True),
        sa.Column("apartment", sa.String(length=20), nullable=True),
        sa.Column("work_summary", sa.Text(), nullable=True),
        sa.Column("customer_remarks", sa.Text(), nullable=True),
        sa.Column("no_claims", sa.Boolean(), nullable=False),
        sa.Column("payment_method", sa.String(length=16), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("content_snapshot", sa.JSON(), nullable=False),
        sa.Column("requisites_snapshot", sa.JSON(), nullable=False),
        sa.Column("document_hash", sa.String(length=64), nullable=False),
        sa.Column("supersedes_act_id", sa.Integer(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("cancelled_by_id", sa.Integer(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancel_reason", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["supersedes_act_id"], ["acts.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["cancelled_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "number", name="uq_acts_org_number"),
    )
    op.create_index("ix_acts_task_id", "acts", ["task_id"])
    op.create_index("ix_acts_org_created", "acts", ["organization_id", "created_at"])

    op.create_table(
        "act_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("act_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("line_type", sa.String(length=16), nullable=False),
        sa.Column("catalog_item_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("qty", sa.Numeric(12, 3), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("serial_number", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["act_id"], ["acts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["catalog_item_id"], ["service_catalog_items.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_act_lines_act_id", "act_lines", ["act_id"])

    op.create_table(
        "act_counters",
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("organization_id", "year"),
    )

    bind = op.get_bind()
    permissions = sa.table(
        "role_permissions",
        sa.column("role", sa.String),
        sa.column("permission", sa.String),
        sa.column("is_allowed", sa.Boolean),
        sa.column("organization_id", sa.Integer),
    )
    for role, permission, allowed in _PERMISSIONS:
        exists = bind.execute(
            sa.select(sa.func.count())
            .select_from(permissions)
            .where(
                permissions.c.role == role,
                permissions.c.permission == permission,
                permissions.c.organization_id.is_(None),
            )
        ).scalar()
        if not exists:
            bind.execute(
                permissions.insert().values(
                    role=role,
                    permission=permission,
                    is_allowed=allowed,
                    organization_id=None,
                )
            )


def downgrade():
    op.execute(
        "DELETE FROM role_permissions WHERE permission IN "
        "('view_acts', 'create_acts', 'manage_acts')"
    )
    op.drop_table("act_counters")
    op.drop_index("ix_act_lines_act_id", table_name="act_lines")
    op.drop_table("act_lines")
    op.drop_index("ix_acts_org_created", table_name="acts")
    op.drop_index("ix_acts_task_id", table_name="acts")
    op.drop_table("acts")
    op.drop_index("ix_service_catalog_org_active", table_name="service_catalog_items")
    op.drop_table("service_catalog_items")
    with op.batch_alter_table("organization_settings") as batch_op:
        batch_op.drop_column("act_logo_file")
        batch_op.drop_column("act_template")
