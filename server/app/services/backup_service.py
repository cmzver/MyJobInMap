"""
Backup Service
==============
Бизнес-логика бэкапов БД (SQLite): список, создание, удаление, восстановление
файлов и настройки расписания. Роутер app/api/admin/backups.py — тонкий.

Примечание: планировщик (app/services/backup_scheduler.py) реализует
автоматические бэкапы независимо; общий низкоуровневый код пока не объединён.
"""

import logging
import os
from datetime import datetime
from typing import List

from fastapi import Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserModel, get_db, get_setting, set_setting
from app.schemas import BackupFile, BackupSettingsResponse, BackupSettingsSchema
from app.services import db_backup
from app.services.audit_log import (
    audit_backup_created,
    audit_backup_deleted,
    audit_backup_restored,
)

logger = logging.getLogger(__name__)

BACKUP_DIR = os.path.join(settings.BASE_DIR, "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


class BackupServiceError(Exception):
    """Исключение операций бэкапа."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


def resolve_sqlite_db_path() -> str:
    """Определить абсолютный путь к файлу SQLite БД."""
    db_url = settings.DATABASE_URL
    if not db_url.startswith("sqlite"):
        raise BackupServiceError("Only supported for SQLite", 400)

    db_path = db_url.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = db_path[2:]
    if not os.path.isabs(db_path):
        db_path = os.path.join(settings.BASE_DIR.parent, db_path)

    if not os.path.exists(db_path):
        if os.path.exists("tasks.db"):
            return os.path.abspath("tasks.db")
        raise BackupServiceError(f"Database file not found at {db_path}", 500)
    return db_path


def validate_backup_filename(filename: str) -> None:
    """Валидация имени файла бэкапа (защита от path traversal)."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise BackupServiceError("Invalid filename", 400)
    if not db_backup.is_valid_backup_name(filename):
        raise BackupServiceError("Invalid backup file", 400)


class BackupService:
    """Файловые операции бэкапов и их настройки."""

    def __init__(self, db: Session):
        self.db = db

    def list_backups(self) -> List[BackupFile]:
        backups: List[BackupFile] = []
        if os.path.exists(BACKUP_DIR):
            for f in os.listdir(BACKUP_DIR):
                if db_backup.is_valid_backup_name(f):
                    path = os.path.join(BACKUP_DIR, f)
                    stat = os.stat(path)
                    backups.append(
                        BackupFile(
                            name=f,
                            size=stat.st_size,
                            created=datetime.fromtimestamp(stat.st_ctime),
                        )
                    )
        backups.sort(key=lambda x: x.created, reverse=True)
        return backups

    def create_backup(self, actor: UserModel) -> str:
        """Создать бэкап БД (SQLite gzip / PostgreSQL pg_dump). Имя файла."""
        try:
            filename = db_backup.create_dump(BACKUP_DIR)
        except db_backup.DBBackupError as e:
            raise BackupServiceError(e.message, e.status_code)

        audit_backup_created(actor.id, actor.username, filename)
        return filename

    def resolve_backup_path(self, filename: str) -> str:
        """Проверить имя и вернуть путь к существующему файлу бэкапа."""
        validate_backup_filename(filename)
        file_path = os.path.join(BACKUP_DIR, filename)
        if not os.path.exists(file_path):
            raise BackupServiceError("Backup not found", 404)
        return file_path

    def delete_backup(self, filename: str, actor: UserModel) -> None:
        file_path = self.resolve_backup_path(filename)
        try:
            os.remove(file_path)
        except Exception as e:
            raise BackupServiceError(str(e), 500)
        audit_backup_deleted(actor.id, actor.username, filename)

    def restore_backup(self, filename: str, actor: UserModel) -> dict:
        """Восстановить БД из бэкапа.

        1. Бэкап текущего состояния (pre_restore_*) — на случай отката.
        2. Восстановление (SQLite: распаковка+валидация+замена файла;
           PostgreSQL: pg_restore --clean).
        """
        backup_path = self.resolve_backup_path(filename)
        try:
            pre_restore_filename = db_backup.create_dump(
                BACKUP_DIR, prefix="pre_restore"
            )
            db_backup.restore_dump(backup_path)
        except db_backup.DBBackupError as e:
            raise BackupServiceError(e.message, e.status_code)
        except Exception as e:
            raise BackupServiceError(f"Restore failed: {str(e)}", 500)

        audit_backup_restored(actor.id, actor.username, filename)
        return {
            "status": "ok",
            "message": f"Database restored from {filename}",
            "pre_restore_backup": pre_restore_filename,
            "warning": "Рекомендуется перезапустить сервер для применения изменений",
        }

    def get_settings(self) -> BackupSettingsResponse:
        # get_setting() возвращает уже типизированное значение, поэтому
        # backup_auto_enabled приходит как bool (а не строкой) — приводим к str
        # перед разбором, чтобы не падать на bool.lower().
        auto_backup = get_setting(self.db, "backup_auto_enabled", True)
        schedule = get_setting(self.db, "backup_schedule", "daily")
        retention = get_setting(self.db, "backup_retention_days", 30)
        return BackupSettingsResponse(
            auto_backup=str(auto_backup).lower() in ("true", "1", "yes", "on"),
            schedule=schedule,
            retention_days=int(retention),
        )

    def update_settings(self, data: BackupSettingsSchema) -> BackupSettingsResponse:
        set_setting(
            self.db,
            "backup_auto_enabled",
            str(data.auto_backup).lower(),
            description="Автоматическое резервное копирование",
            group="backup",
        )
        set_setting(
            self.db,
            "backup_schedule",
            data.schedule,
            description="Расписание бэкапов (daily/weekly/manual)",
            group="backup",
        )
        set_setting(
            self.db,
            "backup_retention_days",
            str(data.retention_days),
            description="Срок хранения бэкапов (дней)",
            group="backup",
        )
        return BackupSettingsResponse(
            auto_backup=data.auto_backup,
            schedule=data.schedule,
            retention_days=data.retention_days,
        )


def get_backup_service(db: Session = Depends(get_db)) -> BackupService:
    return BackupService(db)
