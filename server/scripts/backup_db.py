#!/usr/bin/env python3
"""
Database Backup Script
======================
Автоматическое резервное копирование базы данных с ротацией.

Использование:
    python scripts/backup_db.py                    # Бэкап с настройками по умолчанию
    python scripts/backup_db.py --keep 14          # Хранить 14 дней
    python scripts/backup_db.py --output /backups  # Указать папку для бэкапов

Cron (ежедневно в 3:00):
    0 3 * * * cd /path/to/server && python scripts/backup_db.py >> logs/backup.log 2>&1

Windows Task Scheduler:
    Action: python
    Arguments: scripts/backup_db.py
    Start in: C:\\path\\to\\server
"""

import argparse
import gzip
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Добавляем корень проекта в путь
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings


def get_backup_dir(output_path: str = None) -> Path:
    """Получить директорию для бэкапов"""
    if output_path:
        backup_dir = Path(output_path)
    else:
        backup_dir = settings.BASE_DIR / "backups"

    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def backup_sqlite(backup_dir: Path) -> Path:
    """Бэкап SQLite базы данных"""
    # Извлекаем путь к файлу БД
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = settings.BASE_DIR / db_path[2:]
    else:
        db_path = Path(db_path)

    if not db_path.exists():
        raise FileNotFoundError(f"База данных не найдена: {db_path}")

    # Имя файла бэкапа
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"tasks_db_{timestamp}.sqlite"
    backup_path = backup_dir / backup_name

    # Копируем файл (SQLite безопасен для копирования в idle состоянии)
    # Для production лучше использовать .backup команду через sqlite3
    print(f"📦 Копирование SQLite: {db_path} -> {backup_path}")
    shutil.copy2(db_path, backup_path)

    # Сжимаем
    compressed_path = Path(str(backup_path) + ".gz")
    print(f"🗜️  Сжатие: {backup_path} -> {compressed_path}")

    with open(backup_path, "rb") as f_in:
        with gzip.open(compressed_path, "wb", compresslevel=9) as f_out:
            shutil.copyfileobj(f_in, f_out)

    # Удаляем несжатый файл
    backup_path.unlink()

    return compressed_path


def backup_postgres(backup_dir: Path) -> Path:
    """Бэкап PostgreSQL базы данных"""
    # Парсим DATABASE_URL
    # postgresql://user:password@host:port/dbname
    from urllib.parse import urlparse

    parsed = urlparse(settings.DATABASE_URL)

    db_name = parsed.path.lstrip("/")
    db_user = parsed.username or "postgres"
    db_host = parsed.hostname or "localhost"
    db_port = parsed.port or 5432
    db_password = parsed.password or ""

    # Имя файла бэкапа
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"tasks_db_{timestamp}.sql.gz"
    backup_path = backup_dir / backup_name

    print(f"📦 Дамп PostgreSQL: {db_name}@{db_host} -> {backup_path}")

    # Устанавливаем пароль через переменную окружения
    env = os.environ.copy()
    if db_password:
        env["PGPASSWORD"] = db_password

    # pg_dump с сжатием
    cmd = [
        "pg_dump",
        "-h",
        db_host,
        "-p",
        str(db_port),
        "-U",
        db_user,
        "-d",
        db_name,
        "--format=custom",  # Бинарный формат с сжатием
        "-f",
        str(backup_path).replace(".sql.gz", ".dump"),
    ]

    try:
        result = subprocess.run(
            cmd, env=env, capture_output=True, text=True, check=True
        )
        dump_path = Path(str(backup_path).replace(".sql.gz", ".dump"))

        # Для .dump формата сжатие уже встроено, переименовываем
        final_path = backup_dir / f"tasks_db_{timestamp}.dump"
        dump_path.rename(final_path)

        return final_path

    except subprocess.CalledProcessError as e:
        print(f"❌ pg_dump ошибка: {e.stderr}")
        raise
    except FileNotFoundError:
        print("❌ pg_dump не найден. Установите PostgreSQL client tools.")
        raise


def rotate_backups(backup_dir: Path, keep_days: int):
    """Удалить бэкапы старше N дней"""
    cutoff = datetime.now() - timedelta(days=keep_days)

    patterns = ["tasks_db_*.gz", "tasks_db_*.dump", "tasks_db_*.sqlite"]
    deleted = 0

    for pattern in patterns:
        for backup_file in backup_dir.glob(pattern):
            if backup_file.stat().st_mtime < cutoff.timestamp():
                print(f"🗑️  Удаление старого бэкапа: {backup_file.name}")
                backup_file.unlink()
                deleted += 1

    if deleted:
        print(f"🧹 Удалено старых бэкапов: {deleted}")


def backup_photos(backup_dir: Path) -> Path:
    """Бэкап папки с фотографиями (опционально)"""
    photos_dir = settings.PHOTOS_DIR

    if not photos_dir.exists() or not any(photos_dir.iterdir()):
        print("📷 Папка с фото пуста, пропускаем")
        return None

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_name = f"photos_{timestamp}.tar.gz"
    archive_path = backup_dir / archive_name

    print(f"📷 Архивация фото: {photos_dir} -> {archive_path}")

    # Создаём tar.gz архив
    shutil.make_archive(
        str(archive_path).replace(".tar.gz", ""),
        "gztar",
        root_dir=photos_dir.parent,
        base_dir=photos_dir.name,
    )

    # make_archive добавляет расширение автоматически
    actual_path = Path(str(archive_path).replace(".tar.gz", "") + ".tar.gz")
    if actual_path != archive_path:
        actual_path.rename(archive_path)

    return archive_path


def main():
    parser = argparse.ArgumentParser(
        description="Резервное копирование базы данных FieldWorker"
    )
    parser.add_argument(
        "--keep", type=int, default=7, help="Хранить бэкапы N дней (default: 7)"
    )
    parser.add_argument("--output", type=str, help="Директория для бэкапов")
    parser.add_argument(
        "--with-photos", action="store_true", help="Включить фото в бэкап"
    )
    args = parser.parse_args()

    print("=" * 50)
    print(f"🚀 FieldWorker Backup - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    try:
        backup_dir = get_backup_dir(args.output)
        print(f"📁 Директория бэкапов: {backup_dir}")

        # Бэкап БД
        if settings.is_sqlite:
            backup_path = backup_sqlite(backup_dir)
        elif settings.is_postgres:
            backup_path = backup_postgres(backup_dir)
        else:
            print(f"❌ Неподдерживаемый тип БД: {settings.DATABASE_URL}")
            sys.exit(1)

        backup_size = backup_path.stat().st_size / 1024  # KB
        print(f"✅ Бэкап БД создан: {backup_path.name} ({backup_size:.1f} KB)")

        # Бэкап фото (опционально)
        if args.with_photos:
            photos_backup = backup_photos(backup_dir)
            if photos_backup:
                photos_size = photos_backup.stat().st_size / 1024 / 1024  # MB
                print(
                    f"✅ Бэкап фото создан: {photos_backup.name} ({photos_size:.1f} MB)"
                )

        # Ротация старых бэкапов
        rotate_backups(backup_dir, args.keep)

        print("=" * 50)
        print("✅ Резервное копирование завершено успешно!")
        print("=" * 50)

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
