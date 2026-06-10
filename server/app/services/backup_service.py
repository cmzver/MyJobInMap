"""
Backup Service
==============
Бизнес-логика бэкапов БД (SQLite): список, создание, удаление, восстановление
файлов и настройки расписания. Роутер app/api/admin/backups.py — тонкий.

Примечание: планировщик (app/services/backup_scheduler.py) реализует
автоматические бэкапы независимо; общий низкоуровневый код пока не объединён.
"""

import gzip
import logging
import os
import shutil
import sqlite3
from datetime import datetime
from typing import List

from fastapi import Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserModel, get_db, get_setting, set_setting
from app.schemas import BackupFile, BackupSettingsResponse, BackupSettingsSchema
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
    if not filename.endswith(".sqlite.gz"):
        raise BackupServiceError("Invalid backup file", 400)


class BackupService:
    """Файловые операции бэкапов и их настройки."""

    def __init__(self, db: Session):
        self.db = db

    def list_backups(self) -> List[BackupFile]:
        backups: List[BackupFile] = []
        if os.path.exists(BACKUP_DIR):
            for f in os.listdir(BACKUP_DIR):
                if f.endswith(".sqlite.gz"):
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
        """Создать бэкап БД (только SQLite). Возвращает имя файла."""
        db_path = resolve_sqlite_db_path()

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"tasks_db_{timestamp}.sqlite.gz"
        dest_path = os.path.join(BACKUP_DIR, filename)

        try:
            with open(db_path, "rb") as f_in:
                with gzip.open(dest_path, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
        except Exception as e:
            raise BackupServiceError(str(e), 500)

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

        1. Бэкап текущего состояния (pre_restore_*)
        2. Распаковка во временный файл + валидация SQLite
        3. Замена текущей БД
        """
        backup_path = self.resolve_backup_path(filename)
        db_path = resolve_sqlite_db_path()

        try:
            # 1. Бэкап текущего состояния
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            pre_restore_filename = f"pre_restore_{timestamp}.sqlite.gz"
            pre_restore_path = os.path.join(BACKUP_DIR, pre_restore_filename)

            with open(db_path, "rb") as f_in:
                with gzip.open(pre_restore_path, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)

            # 2. Распаковка во временный файл
            temp_db_path = db_path + ".restore_temp"
            with gzip.open(backup_path, "rb") as f_in:
                with open(temp_db_path, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)

            # 3. Валидация SQLite файла
            try:
                conn = sqlite3.connect(temp_db_path)
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' LIMIT 1"
                )
                cursor.close()
                conn.close()
            except sqlite3.Error as e:
                os.remove(temp_db_path)
                raise BackupServiceError(f"Invalid SQLite file: {str(e)}", 400)

            # 4. Замена текущей БД
            old_db_path = db_path + ".old"
            if os.path.exists(old_db_path):
                os.remove(old_db_path)

            os.rename(db_path, old_db_path)
            os.rename(temp_db_path, db_path)

            if os.path.exists(old_db_path):
                os.remove(old_db_path)

            audit_backup_restored(actor.id, actor.username, filename)

            return {
                "status": "ok",
                "message": f"Database restored from {filename}",
                "pre_restore_backup": pre_restore_filename,
                "warning": "Рекомендуется перезапустить сервер для применения изменений",
            }
        except BackupServiceError:
            raise
        except Exception as e:
            temp_db_path = db_path + ".restore_temp"
            if os.path.exists(temp_db_path):
                os.remove(temp_db_path)
            raise BackupServiceError(f"Restore failed: {str(e)}", 500)

    def get_settings(self) -> BackupSettingsResponse:
        auto_backup = get_setting(self.db, "backup_auto_enabled", "true")
        schedule = get_setting(self.db, "backup_schedule", "daily")
        retention = get_setting(self.db, "backup_retention_days", "30")
        return BackupSettingsResponse(
            auto_backup=auto_backup.lower() == "true",
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
