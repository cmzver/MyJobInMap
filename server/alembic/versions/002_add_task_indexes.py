"""Add task/comment/photo indexes

Revision ID: 002_add_task_indexes
Revises: 001_add_planned_date
Create Date: 2026-01-12 00:05:00.000000

"""
from alembic import op

revision = "002_add_task_indexes"
down_revision = "001_add_planned_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_tasks_status", "tasks", ["status"], unique=False)
    op.create_index("ix_tasks_priority_created", "tasks", ["priority", "created_at"], unique=False)
    op.create_index("ix_tasks_assigned_status", "tasks", ["assigned_user_id", "status"], unique=False)
    op.create_index("ix_tasks_planned_date", "tasks", ["planned_date"], unique=False)

    op.create_index("ix_comments_task_id", "comments", ["task_id"], unique=False)
    op.create_index("ix_task_photos_task_id", "task_photos", ["task_id"], unique=False)
    op.create_index("ix_task_photos_filename", "task_photos", ["filename"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_task_photos_filename", table_name="task_photos")
    op.drop_index("ix_task_photos_task_id", table_name="task_photos")
    op.drop_index("ix_comments_task_id", table_name="comments")

    op.drop_index("ix_tasks_planned_date", table_name="tasks")
    op.drop_index("ix_tasks_assigned_status", table_name="tasks")
    op.drop_index("ix_tasks_priority_created", table_name="tasks")
    op.drop_index("ix_tasks_status", table_name="tasks")
