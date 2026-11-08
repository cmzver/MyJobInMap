"""
Привязка старых заявок к домам из базы
======================================
Новые заявки и дома привязываются сами (TaskService). Этот скрипт — разово
для накопившихся: заявка без address_id, чей адрес совпадает с домом своей
организации, привязывается к нему и получает его точку; карточка дома
показывает только привязанные заявки.

С --geocode заявкам, для которых дома в базе нет, а точки нет или она
(0,0), адрес заново геокодируется (Nominatim — не чаще раза в секунду).

    python scripts/link_tasks_to_addresses.py --dry-run
    python scripts/link_tasks_to_addresses.py --geocode --limit 200
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session  # noqa: E402

from app.models import AddressModel, SessionLocal, TaskModel  # noqa: E402
from app.services.geocoding import geocoding_service  # noqa: E402
from app.services.task_service import (  # noqa: E402
    TaskService,
    has_valid_task_coordinates,
)


def run(
    db: Session,
    geocode: bool = False,
    limit: int = 0,
    dry_run: bool = False,
    pause: float = 1.1,
) -> dict:
    """Привязать заявки; с geocode — дать точку оставшимся. Счётчики."""
    service = TaskService(db)
    linked = 0
    for address in db.query(AddressModel).order_by(AddressModel.id).all():
        linked += service.link_tasks_to_address(address)

    located = still_missing = 0
    if geocode:
        query = (
            db.query(TaskModel)
            .filter(TaskModel.address_id.is_(None))
            .order_by(TaskModel.id)
        )
        missing = [
            task
            for task in query.all()
            if task.raw_address and not has_valid_task_coordinates(task.lat, task.lon)
        ]
        for index, task in enumerate(missing[:limit] if limit else missing):
            if index and pause:
                time.sleep(pause)
            lat, lon = geocoding_service.geocode(task.raw_address)
            if has_valid_task_coordinates(lat, lon):
                task.lat, task.lon = lat, lon
                located += 1
            else:
                still_missing += 1

    if dry_run:
        db.rollback()
    else:
        db.commit()
    return {"linked": linked, "located": located, "still_missing": still_missing}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument(
        "--geocode", action="store_true", help="геокодировать оставшиеся"
    )
    parser.add_argument(
        "--limit", type=int, default=0, help="не больше N геокодирований"
    )
    parser.add_argument("--dry-run", action="store_true", help="только посчитать")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        result = run(db, geocode=args.geocode, limit=args.limit, dry_run=args.dry_run)
    finally:
        db.close()
    prefix = "(пробный прогон) " if args.dry_run else ""
    print(
        f"{prefix}привязано к домам: {result['linked']}, "
        f"получили точку: {result['located']}, без точки: {result['still_missing']}"
    )


if __name__ == "__main__":
    main()
