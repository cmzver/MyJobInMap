"""Add SLA escalations: task_escalations, job_runs, organization flag.

Напоминания о сроках заявок (sla_escalation) и отметки периодических
заданий. Уникальные ключи защищают от повторной отправки.

Revision ID: 20261102_0001
Revises: 20261101_0001
Create Date: 2026-11-02
"""

import sqlalchemy as sa

from alembic import op

revision = "20261102_0001"
down_revision = "20261101_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "task_escalations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("rule", sa.String(length=32), nullable=False),
        sa.Column("due_at_snapshot", sa.DateTime(), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "task_id", "rule", "due_at_snapshot", name="uq_task_escalations_rule"
        ),
    )
    op.create_index("ix_task_escalations_task_id", "task_escalations", ["task_id"])

    op.create_table(
        "job_runs",
        sa.Column("job", sa.String(length=64), nullable=False),
        sa.Column("run_key", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("job", "run_key"),
    )

    with op.batch_alter_table("organization_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "sla_escalations_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )


def downgrade():
    with op.batch_alter_table("organization_settings") as batch_op:
        batch_op.drop_column("sla_escalations_enabled")
    op.drop_table("job_runs")
    op.drop_index("ix_task_escalations_task_id", table_name="task_escalations")
    op.drop_table("task_escalations")
