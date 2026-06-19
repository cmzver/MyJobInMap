"""
ETL: перенос данных SQLite -> PostgreSQL
========================================
Копирует все данные из исходной SQLite-БД в целевую PostgreSQL, опираясь на
SQLAlchemy-метаданные моделей (типы колонок обеспечивают корректное приведение:
bool 0/1 -> boolean, ISO-строки -> timestamp и т.п.).

Идемпотентно: целевые таблицы очищаются (TRUNCATE ... RESTART IDENTITY CASCADE)
перед вставкой. После переноса сбрасываются sequence'ы под максимальные PK и
переносится ``alembic_version`` из источника, чтобы версия схемы совпала.

Запуск (из server/):
    python scripts/migrate_sqlite_to_postgres.py \
        --source sqlite:///./tasks.db \
        --target postgresql+psycopg2://user:pass@host:5432/dbname

Либо через переменные окружения SOURCE_DATABASE_URL / TARGET_DATABASE_URL.

ВАЖНО: целевая БД должна быть пустой или предназначенной под перезапись —
скрипт очищает все таблицы модели.
"""

import argparse
import os
import sys

# Делаем доступным пакет app при запуске из server/ или из корня репо.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, insert, select, text

import app.models  # noqa: F401  — регистрирует все таблицы в Base.metadata
from app.models.base import Base


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SQLite -> PostgreSQL ETL")
    parser.add_argument(
        "--source",
        default=os.environ.get("SOURCE_DATABASE_URL", "sqlite:///./tasks.db"),
        help="URL исходной SQLite БД",
    )
    parser.add_argument(
        "--target",
        default=os.environ.get("TARGET_DATABASE_URL"),
        help="URL целевой PostgreSQL БД",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Не спрашивать подтверждение (очистка целевых таблиц)",
    )
    return parser.parse_args()


def _truncate_all(conn) -> None:
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    if tables:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


def _reset_sequences(conn) -> None:
    """Выставить sequence'ы под максимальные значения PK (после вставки с явными id)."""
    for table in Base.metadata.sorted_tables:
        pk_cols = [c for c in table.primary_key.columns]
        if len(pk_cols) != 1:
            continue
        pk = pk_cols[0]
        if not str(pk.type).upper().startswith("INTEGER"):
            continue
        conn.execute(
            text(
                "SELECT setval("
                "  pg_get_serial_sequence(:tname, :cname),"
                '  COALESCE((SELECT MAX("{col}") FROM "{tbl}"), 1),'
                '  (SELECT COUNT(*) FROM "{tbl}") > 0'
                ")".format(col=pk.name, tbl=table.name)
            ),
            {"tname": table.name, "cname": pk.name},
        )


def _sync_alembic_version(src, tgt) -> None:
    """Перенести версию схемы Alembic (таблица alembic_version вне Base.metadata)."""
    try:
        version = src.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:
        version = None
    if not version:
        print("  alembic_version: пропущено (нет в источнике)")
        return
    tgt.execute(
        text(
            "CREATE TABLE IF NOT EXISTS alembic_version ("
            "version_num VARCHAR(32) NOT NULL "
            "CONSTRAINT alembic_version_pkc PRIMARY KEY)"
        )
    )
    tgt.execute(text("DELETE FROM alembic_version"))
    tgt.execute(
        text("INSERT INTO alembic_version (version_num) VALUES (:v)"),
        {"v": version},
    )
    print(f"  alembic_version: {version}")


def main() -> int:
    args = _parse_args()
    if not args.target:
        print("ОШИБКА: укажите --target или TARGET_DATABASE_URL", file=sys.stderr)
        return 2
    if "postgres" not in args.target:
        print("ОШИБКА: целевой URL не похож на PostgreSQL", file=sys.stderr)
        return 2

    print(f"Источник: {args.source}")
    print(f"Цель:     {args.target}")
    if not args.yes:
        reply = input(
            "Все таблицы цели будут ОЧИЩЕНЫ и перезаписаны. Продолжить? [y/N] "
        )
        if reply.strip().lower() not in ("y", "yes"):
            print("Отменено.")
            return 1

    src_engine = create_engine(args.source)
    tgt_engine = create_engine(args.target)

    # Гарантируем наличие схемы в цели.
    Base.metadata.create_all(tgt_engine)

    total = 0
    with src_engine.connect() as src, tgt_engine.begin() as tgt:
        _truncate_all(tgt)
        for table in Base.metadata.sorted_tables:
            rows = [dict(r._mapping) for r in src.execute(select(table))]
            if rows:
                tgt.execute(insert(table), rows)
            total += len(rows)
            print(f"  {table.name}: {len(rows)}")
        _reset_sequences(tgt)
        _sync_alembic_version(src, tgt)

    print(f"Перенесено строк: {total}")
    src_engine.dispose()
    tgt_engine.dispose()
    print("Готово.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
