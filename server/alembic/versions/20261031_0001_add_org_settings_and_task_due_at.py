"""Add organization settings and task due_at.

Revision ID: 20261031_0001
Revises: 20261029_0001
Create Date: 2026-10-31
"""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from alembic import op

revision = "20261031_0001"
down_revision = "20261029_0001"
branch_labels = None
depends_on = None

# Снимок нормативов и пояса на момент миграции — код приложения может
# поменяться, а пересчитанные здесь сроки должны остаться такими.
_SLA_HOURS = {
    "PLANNED": 168,
    "CURRENT": 48,
    "URGENT": 8,
    "EMERGENCY": 4,
    "1": 168,
    "2": 48,
    "3": 8,
    "4": 4,
}
_TZ = ZoneInfo("Europe/Moscow")


def _due_at(priority, created_at, planned_date):
    if planned_date is not None:
        local_end = datetime.combine(
            planned_date.date() + timedelta(days=1), time.min, _TZ
        )
        return local_end.astimezone(timezone.utc).replace(tzinfo=None)
    if created_at is None:
        return None
    if created_at.tzinfo is not None:
        created_at = created_at.astimezone(timezone.utc).replace(tzinfo=None)
    hours = _SLA_HOURS.get(str(priority or "").upper(), 48)
    return created_at + timedelta(hours=hours)


def upgrade():
    op.create_table(
        "organization_settings",
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("legal_name", sa.String(length=300), nullable=True),
        sa.Column("inn", sa.String(length=12), nullable=True),
        sa.Column("kpp", sa.String(length=9), nullable=True),
        sa.Column("ogrn", sa.String(length=15), nullable=True),
        sa.Column("legal_address", sa.String(length=500), nullable=True),
        sa.Column("bank_name", sa.String(length=200), nullable=True),
        sa.Column("bik", sa.String(length=9), nullable=True),
        sa.Column("account", sa.String(length=20), nullable=True),
        sa.Column("corr_account", sa.String(length=20), nullable=True),
        sa.Column("director_name", sa.String(length=200), nullable=True),
        sa.Column("director_title", sa.String(length=100), nullable=True),
        sa.Column(
            "act_number_prefix",
            sa.String(length=10),
            nullable=False,
            server_default="А",
        ),
        sa.Column("act_footer_text", sa.Text(), nullable=True),
        sa.Column("sla_hours", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("organization_id"),
    )

    op.add_column("tasks", sa.Column("due_at", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_tasks_org_status_due", "tasks", ["organization_id", "status", "due_at"]
    )

    # Сроки уже существующих заявок — по нормативам по умолчанию: своих
    # нормативов у организаций до этой миграции не было.
    bind = op.get_bind()
    tasks = sa.table(
        "tasks",
        sa.column("id", sa.Integer),
        sa.column("priority", sa.String),
        sa.column("created_at", sa.DateTime),
        sa.column("planned_date", sa.DateTime),
        sa.column("due_at", sa.DateTime),
    )
    rows = bind.execute(
        sa.select(
            tasks.c.id, tasks.c.priority, tasks.c.created_at, tasks.c.planned_date
        )
    ).fetchall()
    for row in rows:
        due_at = _due_at(row.priority, row.created_at, row.planned_date)
        if due_at is not None:
            bind.execute(
                tasks.update().where(tasks.c.id == row.id).values(due_at=due_at)
            )


def downgrade():
    op.drop_index("ix_tasks_org_status_due", table_name="tasks")
    op.drop_column("tasks", "due_at")
    op.drop_table("organization_settings")
