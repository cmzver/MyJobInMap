"""
Backup Scheduler Service
========================
Автоматическое резервное копирование по расписанию через APScheduler.

Конфигурация через .env:
    BACKUP_SCHEDULER_ENABLED=true   # Включить планировщик
    BACKUP_SCHEDULE_HOUR=3          # Час запуска (0-23)
    BACKUP_SCHEDULE_MINUTE=0        # Минута запуска (0-59)
    BACKUP_RETENTION_DAYS=30        # Срок хранения бэкапов

Планировщик запускается при старте сервера (в lifespan)
и выполняет ежедневный бэкап + ротацию старых файлов.
"""

import gzip
import logging
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# APScheduler instance (инициализируется лениво)
_scheduler = None


def _resolve_sqlite_db_path() -> str:
    """Извлечь реальный путь к файлу SQLite из DATABASE_URL."""
    db_url = settings.DATABASE_URL
    if not db_url.startswith("sqlite"):
        raise RuntimeError("Scheduled backup поддерживает только SQLite. "
                           "Для PostgreSQL используйте pg_dump cron.")

    db_path = db_url.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = str(settings.BASE_DIR / db_path[2:])
    return db_path


def _run_backup() -> Optional[str]:
    """
    Выполнить бэкап БД + ротацию старых файлов.
    Возвращает имя созданного файла или None при ошибке.
    """
    backup_dir = settings.BASE_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    try:
        db_path = _resolve_sqlite_db_path()

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"tasks_db_{timestamp}.sqlite.gz"
        dest_path = backup_dir / filename

        with open(db_path, "rb") as f_in:
            with gzip.open(str(dest_path), "wb", compresslevel=6) as f_out:
                shutil.copyfileobj(f_in, f_out)

        size_kb = dest_path.stat().st_size / 1024
        logger.info("✅ Scheduled backup created: %s (%.1f KB)", filename, size_kb)

        # Ротация старых бэкапов
        _rotate_backups(backup_dir, settings.BACKUP_RETENTION_DAYS)

        return filename

    except Exception:
        logger.exception("❌ Scheduled backup failed")
        return None


def _rotate_backups(backup_dir: Path, retention_days: int) -> int:
    """Удалить бэкапы старше retention_days. Возвращает кол-во удалённых."""
    cutoff = datetime.now() - timedelta(days=retention_days)
    deleted = 0

    for pattern in ["tasks_db_*.gz", "tasks_db_*.dump"]:
        for backup_file in backup_dir.glob(pattern):
            try:
                if backup_file.stat().st_mtime < cutoff.timestamp():
                    backup_file.unlink()
                    logger.info("🗑️  Rotated old backup: %s", backup_file.name)
                    deleted += 1
            except OSError as e:
                logger.warning("Failed to delete %s: %s", backup_file.name, e)

    if deleted:
        logger.info("🧹 Rotated %d old backup(s)", deleted)
    return deleted


def start_scheduler() -> bool:
    """
    Запуск планировщика бэкапов (вызывается из lifespan).
    Возвращает True если планировщик запущен, False если отключён или недоступен.
    """
    global _scheduler

    if not settings.BACKUP_SCHEDULER_ENABLED:
        logger.info("Backup scheduler disabled (BACKUP_SCHEDULER_ENABLED=false)")
        return False

    if not settings.is_sqlite:
        logger.warning(
            "📦 Backup scheduler не поддерживает %s — используйте pg_dump cron",
            "PostgreSQL" if settings.is_postgres else "unknown DB"
        )
        return False

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:
        logger.warning(
            "📦 APScheduler не установлен. Установите: pip install apscheduler"
        )
        return False

    _scheduler = BackgroundScheduler(daemon=True)

    trigger = CronTrigger(
        hour=settings.BACKUP_SCHEDULE_HOUR,
        minute=settings.BACKUP_SCHEDULE_MINUTE,
    )

    _scheduler.add_job(
        _run_backup,
        trigger=trigger,
        id="daily_backup",
        name="Daily database backup",
        replace_existing=True,
        misfire_grace_time=3600,  # 1ч grace period при пропуске
    )

    _scheduler.start()

    logger.info(
        "📦 Backup scheduler started: daily at %02d:%02d, retention %d days",
        settings.BACKUP_SCHEDULE_HOUR,
        settings.BACKUP_SCHEDULE_MINUTE,
        settings.BACKUP_RETENTION_DAYS,
    )
    return True


def stop_scheduler():
    """Остановка планировщика (вызывается из lifespan shutdown)."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("📦 Backup scheduler stopped")
        _scheduler = None


def get_scheduler_status() -> dict:
    """Получить статус планировщика для API/диагностики."""
    if not settings.BACKUP_SCHEDULER_ENABLED:
        return {"enabled": False, "running": False}

    next_run = None
    if _scheduler and _scheduler.running:
        job = _scheduler.get_job("daily_backup")
        if job is not None:
            next_run = str(job.next_run_time)

    return {
        "enabled": True,
        "running": _scheduler is not None and _scheduler.running,
        "schedule": f"{settings.BACKUP_SCHEDULE_HOUR:02d}:{settings.BACKUP_SCHEDULE_MINUTE:02d}",
        "retention_days": settings.BACKUP_RETENTION_DAYS,
        "next_run": next_run,
    }
