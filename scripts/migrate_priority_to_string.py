"""
Convert legacy numeric task priorities to string enum values.

Usage:
    python scripts/migrate_priority_to_string.py

It will:
- Update TaskModel.priority from 1/2/3/4 (or their string forms) to
  PLANNED/CURRENT/URGENT/EMERGENCY.
- Update SystemSettingModel.default_task_priority if it still stores a numeric value.
The script is idempotent and safe to run multiple times.
"""

from app.models import SessionLocal, TaskModel, SystemSettingModel
from app.models.enums import TaskPriority


MAPPING = {
    1: TaskPriority.PLANNED.value,
    2: TaskPriority.CURRENT.value,
    3: TaskPriority.URGENT.value,
    4: TaskPriority.EMERGENCY.value,
    "1": TaskPriority.PLANNED.value,
    "2": TaskPriority.CURRENT.value,
    "3": TaskPriority.URGENT.value,
    "4": TaskPriority.EMERGENCY.value,
}


def normalize_priority(value):
    """Return normalized priority string or None if unknown."""
    if value in MAPPING:
        return MAPPING[value]
    return None


def migrate():
    db = SessionLocal()
    try:
        tasks = db.query(TaskModel).all()
        updated = 0
        for task in tasks:
            normalized = normalize_priority(task.priority)
            if normalized and task.priority != normalized:
                task.priority = normalized
                updated += 1

        setting = (
            db.query(SystemSettingModel)
            .filter(SystemSettingModel.key == "default_task_priority")
            .first()
        )
        if setting and setting.value in MAPPING:
            setting.value = MAPPING[setting.value]

        db.commit()
        print(f"Updated tasks: {updated}")
        if setting:
            print(f"Default priority setting: {setting.value}")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
