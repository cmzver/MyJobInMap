"""
Район и код дома ФИАС для уже заведённых адресов
=================================================
Новые адреса получают их при создании; этот скрипт — разово для старых.
Ходит в DaData по адресу без района (бесплатный тариф — 10 000 запросов
в сутки, поэтому есть --limit; повторный запуск продолжит с оставшихся).

    python scripts/backfill_address_district.py --dry-run
    python scripts/backfill_address_district.py --limit 2000
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session  # noqa: E402

from app.models import AddressModel, SessionLocal  # noqa: E402
from app.services import address_suggest  # noqa: E402


def backfill(db: Session, limit: int = 0, dry_run: bool = False) -> dict:
    """Заполнить district/fias_id адресам без района. Возвращает счётчики filled/not_found."""
    query = (
        db.query(AddressModel)
        .filter(AddressModel.district.is_(None))
        .order_by(AddressModel.id)
    )
    if limit:
        query = query.limit(limit)
    filled = not_found = 0
    for address in query.all():
        house = address_suggest.house_details(address.address)
        if not house:
            not_found += 1
            continue
        filled += 1
        if not dry_run:
            address.district = house["district"]
            address.fias_id = house["fias_id"]
    if not dry_run:
        db.commit()
    return {"filled": filled, "not_found": not_found}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument("--limit", type=int, default=0, help="не больше N адресов")
    parser.add_argument("--dry-run", action="store_true", help="только посчитать")
    args = parser.parse_args()
    if not address_suggest.is_enabled():
        sys.exit("DADATA_API_KEY не задан — справочник недоступен")
    db = SessionLocal()
    try:
        result = backfill(db, limit=args.limit, dry_run=args.dry_run)
    finally:
        db.close()
    action = "найдено бы" if args.dry_run else "заполнено"
    print(f"{action}: {result['filled']}, дом не найден: {result['not_found']}")


if __name__ == "__main__":
    main()
