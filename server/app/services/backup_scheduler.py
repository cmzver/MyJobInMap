"""
Backup Scheduler Service
========================
Автоматическое резервное копирование по расписанию через APScheduler.

Подсистема включается через .env (ops-уровень):
    BACKUP_SCHEDULER_ENABLED=true   # Включить планировщик целиком
    BACKUP_SCHEDULE_HOUR=3          # Час запуска (0-23)
    BACKUP_SCHEDULE_MINUTE=0        # Минута запуска (0-59)

Само расписание задаётся из UI и хранится в БД (group="backup"):
    backup_auto_enabled  (bool)        # Включено ли автокопирование
    backup_schedule      (daily|weekly|manual)
    backup_retention_days(int)         # Срок хранения бэкапов

При старте сервера (lifespan) планировщик поднимается, если включён в .env,
и конфигурирует задачу по настройкам из БД. После сохранения настроек в
портале вызывается apply_settings() — задача переназначается на лету.
"""

import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.config import settings
from app.services import db_backup

logger = logging.getLogger(__name__)

# APScheduler instance (инициализируется лениво)
_scheduler = None

_JOB_ID = "daily_backup"


def _read_db_settings() -> dict:
    """Прочитать UI-настройки бэкапа из БД (auto/schedule/retention).

    Возвращает уже нормализованный dict; при недоступности БД или некорректных
    значениях падает на дефолты (env для retention)."""
    auto_backup = True
    schedule = "daily"
    retention = settings.BACKUP_RETENTION_DAYS

    try:
        from app.models import SessionLocal, get_setting

        db = SessionLocal()
        try:
            auto_backup = get_setting(db, "backup_auto_enabled", True)
            schedule = get_setting(db, "backup_schedule", "daily")
            retention = get_setting(
                db, "backup_retention_days", settings.BACKUP_RETENTION_DAYS
            )
        finally:
            db.close()
    except Exception:
        logger.exception("Failed to read backup settings from DB; using defaults")

    auto_enabled = str(auto_backup).lower() in ("true", "1", "yes", "on")
    try:
        retention_days = int(retention)
    except (TypeError, ValueError):
        retention_days = settings.BACKUP_RETENTION_DAYS

    return {
        "auto_backup": auto_enabled,
        "schedule": str(schedule),
        "retention_days": retention_days,
    }


def _build_trigger(schedule: str):
    """CronTrigger по выбранной частоте. Час/минута — из .env."""
    from apscheduler.triggers.cron import CronTrigger

    hour = settings.BACKUP_SCHEDULE_HOUR
    minute = settings.BACKUP_SCHEDULE_MINUTE
    if schedule == "weekly":
        return CronTrigger(day_of_week="mon", hour=hour, minute=minute)
    # daily (по умолчанию)
    return CronTrigger(hour=hour, minute=minute)


def _format_schedule_label(cfg: dict) -> str:
    """Человекочитаемая строка расписания для статуса/портала."""
    if not cfg["auto_backup"] or cfg["schedule"] == "manual":
        return "Вручную"
    time_str = (
        f"{settings.BACKUP_SCHEDULE_HOUR:02d}:{settings.BACKUP_SCHEDULE_MINUTE:02d}"
    )
    if cfg["schedule"] == "weekly":
        return f"Еженедельно, Пн {time_str}"
    return f"Ежедневно {time_str}"


def _run_backup() -> Optional[str]:
    """
    Выполнить бэкап БД + ротацию старых файлов.
    Возвращает имя созданного файла или None при ошибке.
    """
    backup_dir = settings.BASE_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    try:
        filename = db_backup.create_dump(str(backup_dir))
        size_kb = (backup_dir / filename).stat().st_size / 1024
        logger.info("✅ Scheduled backup created: %s (%.1f KB)", filename, size_kb)

        # Ротация старых бэкапов по сроку из UI-настроек (fallback на .env)
        retention = _read_db_settings()["retention_days"]
        _rotate_backups(backup_dir, retention)

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


def apply_settings() -> dict:
    """(Пере)настроить задачу бэкапа по текущим настройкам из БД.

    daily/weekly → задача добавляется/заменяется; manual или выключенное
    автокопирование → задача снимается. No-op, если подсистема не запущена
    (BACKUP_SCHEDULER_ENABLED=false). Возвращает актуальный статус."""
    global _scheduler

    if _scheduler is None or not _scheduler.running:
        return get_scheduler_status()

    cfg = _read_db_settings()

    if cfg["auto_backup"] and cfg["schedule"] != "manual":
        _scheduler.add_job(
            _run_backup,
            trigger=_build_trigger(cfg["schedule"]),
            id=_JOB_ID,
            name="Scheduled database backup",
            replace_existing=True,
            misfire_grace_time=3600,  # 1ч grace period при пропуске
        )
        logger.info(
            "📦 Backup job scheduled: %s, retention %d days",
            cfg["schedule"],
            cfg["retention_days"],
        )
    else:
        if _scheduler.get_job(_JOB_ID) is not None:
            _scheduler.remove_job(_JOB_ID)
        logger.info(
            "📦 Backup job disabled (auto_backup=%s, schedule=%s)",
            cfg["auto_backup"],
            cfg["schedule"],
        )

    return get_scheduler_status()


def start_scheduler() -> bool:
    """
    Запуск планировщика бэкапов (вызывается из lifespan).
    Возвращает True если планировщик запущен, False если отключён или недоступен.
    """
    global _scheduler

    if not settings.BACKUP_SCHEDULER_ENABLED:
        logger.info("Backup scheduler disabled (BACKUP_SCHEDULER_ENABLED=false)")
        return False

    if not (settings.is_sqlite or settings.is_postgres):
        logger.warning("📦 Backup scheduler не поддерживает текущую БД")
        return False

    try:
        from apscheduler.schedulers.background import BackgroundScheduler  # noqa: F401
    except ImportError:
        logger.warning(
            "📦 APScheduler не установлен. Установите: pip install apscheduler"
        )
        return False

    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.start()

    # Конфигурируем задачу по настройкам из БД (частота/срок хранения из UI).
    apply_settings()

    logger.info(
        "📦 Backup scheduler started (window %02d:%02d)",
        settings.BACKUP_SCHEDULE_HOUR,
        settings.BACKUP_SCHEDULE_MINUTE,
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

    cfg = _read_db_settings()
    running = _scheduler is not None and _scheduler.running

    next_run = None
    if running:
        job = _scheduler.get_job(_JOB_ID)
        if job is not None and job.next_run_time is not None:
            next_run = str(job.next_run_time)

    return {
        "enabled": True,
        "running": running,
        "auto_backup": cfg["auto_backup"],
        "schedule": _format_schedule_label(cfg),
        "retention_days": cfg["retention_days"],
        "next_run": next_run,
    }
