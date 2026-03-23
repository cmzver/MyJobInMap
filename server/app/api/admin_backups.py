"""
Admin Backups & Database API
=============================
Эндпоинты для управления бэкапами, инструментами БД и seed-данными.
"""

import gzip
import logging
import os
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (CommentModel, CustomFieldModel, DeviceModel,
                        SystemSettingModel, TaskModel, TaskPhotoModel,
                        TaskPriority, UserModel, UserRole, get_db, get_setting,
                        set_setting)
from app.models.address import AddressModel
from app.models.notification import NotificationModel
from app.schemas import (BackupFile, BackupListResponse,
                         BackupSettingsResponse, BackupSettingsSchema)
from app.services import (get_current_admin, get_current_superadmin,
                          get_password_hash)
from app.services.audit_log import (audit_backup_created, audit_backup_deleted,
                                    audit_backup_restored)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin - Backups & DB"])


BACKUP_DIR = os.path.join(settings.BASE_DIR, "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


# ============================================================================
# Backups
# ============================================================================


def _resolve_sqlite_db_path() -> str:
    """Определить абсолютный путь к файлу SQLite БД."""
    db_url = settings.DATABASE_URL
    if not db_url.startswith("sqlite"):
        raise HTTPException(status_code=400, detail="Only supported for SQLite")

    db_path = db_url.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = db_path[2:]
    if not os.path.isabs(db_path):
        db_path = os.path.join(settings.BASE_DIR.parent, db_path)

    if not os.path.exists(db_path):
        if os.path.exists("tasks.db"):
            return os.path.abspath("tasks.db")
        raise HTTPException(
            status_code=500, detail=f"Database file not found at {db_path}"
        )
    return db_path


def _validate_backup_filename(filename: str) -> None:
    """Валидация имени файла бэкапа (защита от path traversal)."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not filename.endswith(".sqlite.gz"):
        raise HTTPException(status_code=400, detail="Invalid backup file")


@router.get("/backups", response_model=BackupListResponse)
async def list_backups(
    admin: UserModel = Depends(get_current_superadmin),
):
    """Список бэкапов."""
    backups = []
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
    return {"backups": backups}


@router.post("/backups")
async def run_backup(
    admin: UserModel = Depends(get_current_superadmin),
):
    """Создать бэкап БД (только SQLite)."""
    db_path = _resolve_sqlite_db_path()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"tasks_db_{timestamp}.sqlite.gz"
    dest_path = os.path.join(BACKUP_DIR, filename)

    try:
        with open(db_path, "rb") as f_in:
            with gzip.open(dest_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        audit_backup_created(admin.id, admin.username, filename)
        return {"status": "ok", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -- Backup settings --------------------------------------------------------


@router.get("/backups/settings", response_model=BackupSettingsResponse)
async def get_backup_settings(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Получить настройки резервного копирования."""
    auto_backup = get_setting(db, "backup_auto_enabled", "true")
    schedule = get_setting(db, "backup_schedule", "daily")
    retention = get_setting(db, "backup_retention_days", "30")

    return BackupSettingsResponse(
        auto_backup=auto_backup.lower() == "true",
        schedule=schedule,
        retention_days=int(retention),
    )


@router.patch("/backups/settings", response_model=BackupSettingsResponse)
async def update_backup_settings(
    settings_data: BackupSettingsSchema,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Обновить настройки резервного копирования."""
    set_setting(
        db,
        "backup_auto_enabled",
        str(settings_data.auto_backup).lower(),
        description="Автоматическое резервное копирование",
        group="backup",
    )
    set_setting(
        db,
        "backup_schedule",
        settings_data.schedule,
        description="Расписание бэкапов (daily/weekly/manual)",
        group="backup",
    )
    set_setting(
        db,
        "backup_retention_days",
        str(settings_data.retention_days),
        description="Срок хранения бэкапов (дней)",
        group="backup",
    )

    return BackupSettingsResponse(
        auto_backup=settings_data.auto_backup,
        schedule=settings_data.schedule,
        retention_days=settings_data.retention_days,
    )


# -- Backup file operations --------------------------------------------------


@router.get("/backups/{filename}/download")
async def download_backup(
    filename: str,
    admin: UserModel = Depends(get_current_superadmin),
):
    """Скачать бэкап."""
    _validate_backup_filename(filename)
    file_path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Backup not found")

    return FileResponse(file_path, media_type="application/gzip", filename=filename)


@router.delete("/backups/{filename}")
async def delete_backup(
    filename: str,
    admin: UserModel = Depends(get_current_superadmin),
):
    """Удалить бэкап."""
    _validate_backup_filename(filename)
    file_path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Backup not found")

    try:
        os.remove(file_path)
        audit_backup_deleted(admin.id, admin.username, filename)
        return {"status": "ok", "message": f"Backup {filename} deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backups/{filename}/restore")
async def restore_backup(
    filename: str,
    admin: UserModel = Depends(get_current_superadmin),
):
    """
    Восстановить БД из бэкапа.

    Процесс:
    1. Создаётся автоматический бэкап текущего состояния (pre_restore_*)
    2. Распаковывается выбранный бэкап
    3. Заменяется текущая БД

    ВАЖНО: После восстановления рекомендуется перезапустить сервер!
    """
    _validate_backup_filename(filename)
    backup_path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="Backup not found")

    db_path = _resolve_sqlite_db_path()

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
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1")
            cursor.close()
            conn.close()
        except sqlite3.Error as e:
            os.remove(temp_db_path)
            raise HTTPException(
                status_code=400, detail=f"Invalid SQLite file: {str(e)}"
            )

        # 4. Замена текущей БД
        old_db_path = db_path + ".old"
        if os.path.exists(old_db_path):
            os.remove(old_db_path)

        os.rename(db_path, old_db_path)
        os.rename(temp_db_path, db_path)

        if os.path.exists(old_db_path):
            os.remove(old_db_path)

        audit_backup_restored(admin.id, admin.username, filename)

        return {
            "status": "ok",
            "message": f"Database restored from {filename}",
            "pre_restore_backup": pre_restore_filename,
            "warning": "Рекомендуется перезапустить сервер для применения изменений",
        }
    except HTTPException:
        raise
    except Exception as e:
        temp_db_path = db_path + ".restore_temp"
        if os.path.exists(temp_db_path):
            os.remove(temp_db_path)
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")


# ============================================================================
# Database Management
# ============================================================================


@router.post("/db/seed")
async def seed_database(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Добавить тестовые данные в БД."""
    try:
        tasks_count = db.query(TaskModel).count()
        if tasks_count > 0:
            raise HTTPException(
                status_code=400,
                detail="В базе уже есть заявки. Сначала очистите БД.",
            )

        from app.services import get_password_hash

        users_created = 0

        # Admin
        admin_user = db.query(UserModel).filter(UserModel.username == "admin").first()
        if not admin_user:
            admin_user = UserModel(
                username="admin",
                password_hash=get_password_hash("admin"),
                full_name="Admin User",
                role=UserRole.ADMIN.value,
                is_active=True,
            )
            db.add(admin_user)
            db.flush()
            users_created += 1

        # Worker 1
        worker1 = db.query(UserModel).filter(UserModel.username == "worker1").first()
        if not worker1:
            worker1 = UserModel(
                username="worker1",
                password_hash=get_password_hash("worker1"),
                full_name="Иван Полевой",
                role=UserRole.WORKER.value,
                is_active=True,
            )
            db.add(worker1)
            db.flush()
            users_created += 1

        # Worker 2
        worker2 = db.query(UserModel).filter(UserModel.username == "worker2").first()
        if not worker2:
            worker2 = UserModel(
                username="worker2",
                password_hash=get_password_hash("worker2"),
                full_name="Анна Сервисная",
                role=UserRole.WORKER.value,
                is_active=True,
            )
            db.add(worker2)
            db.flush()
            users_created += 1

        now = datetime.now(timezone.utc)

        test_tasks = [
            TaskModel(
                task_number="FW-0001",
                title="Аварийная протечка",
                raw_address="СПб, Невский проспект, 1",
                description="Срочная заявка на устранение протечки в санузле.",
                lat=59.935,
                lon=30.325,
                status="NEW",
                priority=TaskPriority.EMERGENCY.value,
                assigned_user_id=worker1.id,
                is_remote=False,
                is_paid=True,
                payment_amount=2500.0,
                created_at=now,
                updated_at=now,
            ),
            TaskModel(
                task_number="FW-0002",
                title="Проверка отопления",
                raw_address="Москва, Красная площадь, 1",
                description="Плановая проверка системы отопления.",
                lat=55.754,
                lon=37.620,
                status="IN_PROGRESS",
                priority=TaskPriority.CURRENT.value,
                assigned_user_id=worker2.id,
                is_remote=False,
                is_paid=True,
                payment_amount=1800.0,
                created_at=now - timedelta(days=1),
                updated_at=now,
            ),
            TaskModel(
                task_number="FW-0003",
                title="Консультация по телефону",
                raw_address="Удалённо",
                description="Техническая консультация по видеосвязи.",
                lat=None,
                lon=None,
                status="DONE",
                priority=TaskPriority.CURRENT.value,
                assigned_user_id=worker1.id,
                is_remote=True,
                is_paid=False,
                payment_amount=None,
                created_at=now - timedelta(days=2),
                updated_at=now - timedelta(hours=1),
            ),
            TaskModel(
                task_number="FW-0004",
                title="Ремонт окна",
                raw_address="Казань, ул. Ленина, 42",
                description="Замена разбитого стеклопакета.",
                lat=55.796,
                lon=49.108,
                status="NEW",
                priority=TaskPriority.PLANNED.value,
                assigned_user_id=None,
                is_remote=False,
                is_paid=True,
                payment_amount=3200.0,
                created_at=now - timedelta(hours=2),
                updated_at=now - timedelta(hours=2),
            ),
            TaskModel(
                task_number="FW-0005",
                title="Замена дверного замка",
                raw_address="СПб, Лиговский проспект, 120",
                description="Установка нового замка и личинки.",
                lat=59.930,
                lon=30.340,
                status="DONE",
                priority=TaskPriority.CURRENT.value,
                assigned_user_id=worker2.id,
                is_remote=False,
                is_paid=True,
                payment_amount=1500.0,
                created_at=now - timedelta(days=3),
                updated_at=now - timedelta(days=2),
            ),
        ]

        for task in test_tasks:
            db.add(task)
        db.commit()

        return {
            "status": "ok",
            "message": "Тестовые данные загружены успешно",
            "users_created": users_created,
            "tasks_created": len(test_tasks),
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки данных: {str(e)}")


# ============================================================================
# Database Tools
# ============================================================================


@router.get("/db/stats")
async def get_database_stats(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Получить детальную статистику БД."""
    try:
        db_url = settings.DATABASE_URL
        db_path = None
        db_size = 0

        if db_url.startswith("sqlite"):
            db_path = db_url.replace("sqlite:///", "")
            if db_path.startswith("./"):
                db_path = db_path[2:]
            if not os.path.isabs(db_path):
                db_path = os.path.join(settings.BASE_DIR, db_path)
            if os.path.exists(db_path):
                db_size = os.path.getsize(db_path)

        tasks_count = db.query(TaskModel).count()
        users_count = db.query(UserModel).count()
        comments_count = db.query(CommentModel).count()
        devices_count = db.query(DeviceModel).count()

        photos_count = 0
        addresses_count = 0
        notifications_count = 0
        try:
            photos_count = db.query(TaskPhotoModel).count()
        except Exception:
            pass
        try:
            addresses_count = db.query(AddressModel).count()
        except Exception:
            pass
        try:
            notifications_count = db.query(NotificationModel).count()
        except Exception:
            pass

        tasks_new = db.query(TaskModel).filter(TaskModel.status == "NEW").count()
        tasks_in_progress = (
            db.query(TaskModel).filter(TaskModel.status == "IN_PROGRESS").count()
        )
        tasks_done = db.query(TaskModel).filter(TaskModel.status == "DONE").count()
        tasks_cancelled = (
            db.query(TaskModel).filter(TaskModel.status == "CANCELLED").count()
        )

        last_task = db.query(TaskModel).order_by(TaskModel.updated_at.desc()).first()
        last_activity = last_task.updated_at.isoformat() if last_task else None

        backup_count = 0
        if os.path.exists(BACKUP_DIR):
            backup_count = len([f for f in os.listdir(BACKUP_DIR) if f.endswith(".gz")])

        return {
            "database": {
                "type": "SQLite" if settings.is_sqlite else "PostgreSQL",
                "path": db_path,
                "size_bytes": db_size,
                "size_mb": round(db_size / (1024 * 1024), 2) if db_size else 0,
            },
            "tables": {
                "tasks": tasks_count,
                "users": users_count,
                "comments": comments_count,
                "devices": devices_count,
                "photos": photos_count,
                "addresses": addresses_count,
                "notifications": notifications_count,
            },
            "tasks_by_status": {
                "new": tasks_new,
                "in_progress": tasks_in_progress,
                "done": tasks_done,
                "cancelled": tasks_cancelled,
            },
            "last_activity": last_activity,
            "backups_count": backup_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/db/integrity")
async def check_database_integrity(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Проверить целостность БД (PRAGMA integrity_check)."""
    try:
        if not settings.is_sqlite:
            raise HTTPException(
                status_code=400, detail="Integrity check only supported for SQLite"
            )

        result = db.execute(text("PRAGMA integrity_check")).fetchall()
        is_ok = len(result) == 1 and result[0][0] == "ok"

        return {
            "status": "ok" if is_ok else "error",
            "integrity": "passed" if is_ok else "failed",
            "details": [row[0] for row in result] if not is_ok else None,
            "message": (
                "База данных в порядке" if is_ok else "Обнаружены проблемы целостности"
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/db/cleanup")
async def cleanup_old_data(
    days: int = 90,
    include_done: bool = True,
    include_cancelled: bool = True,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """
    Удалить старые заявки (старше N дней).

    - days: количество дней (по умолчанию 90)
    - include_done: удалять выполненные заявки
    - include_cancelled: удалять отменённые заявки
    """
    try:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

        statuses = []
        if include_done:
            statuses.append("DONE")
        if include_cancelled:
            statuses.append("CANCELLED")

        if not statuses:
            return {
                "status": "ok",
                "message": "Не выбраны статусы для удаления",
                "deleted_tasks": 0,
                "deleted_comments": 0,
                "deleted_photos": 0,
            }

        old_tasks = (
            db.query(TaskModel)
            .filter(
                TaskModel.status.in_(statuses),
                TaskModel.updated_at < cutoff_date,
            )
            .all()
        )

        task_ids = [t.id for t in old_tasks]

        if not task_ids:
            return {
                "status": "ok",
                "message": f"Нет заявок старше {days} дней для удаления",
                "deleted_tasks": 0,
                "deleted_comments": 0,
                "deleted_photos": 0,
            }

        deleted_comments = (
            db.query(CommentModel)
            .filter(
                CommentModel.task_id.in_(task_ids),
            )
            .delete(synchronize_session=False)
        )

        deleted_photos = 0
        try:
            photos = (
                db.query(TaskPhotoModel)
                .filter(
                    TaskPhotoModel.task_id.in_(task_ids),
                )
                .all()
            )
            for photo in photos:
                photo_path = settings.PHOTOS_DIR / photo.filename
                if photo_path.exists():
                    photo_path.unlink()
            deleted_photos = (
                db.query(TaskPhotoModel)
                .filter(
                    TaskPhotoModel.task_id.in_(task_ids),
                )
                .delete(synchronize_session=False)
            )
        except Exception:
            logger.warning("Failed to delete photos for old tasks")

        deleted_tasks = (
            db.query(TaskModel)
            .filter(
                TaskModel.id.in_(task_ids),
            )
            .delete(synchronize_session=False)
        )

        db.commit()

        return {
            "status": "ok",
            "message": f"Удалены заявки старше {days} дней",
            "deleted_tasks": deleted_tasks,
            "deleted_comments": deleted_comments,
            "deleted_photos": deleted_photos,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/db/vacuum")
async def vacuum_database(
    admin: UserModel = Depends(get_current_superadmin),
):
    """Оптимизировать БД (VACUUM). Использует прямое sqlite3-подключение."""
    if not settings.is_sqlite:
        raise HTTPException(status_code=400, detail="VACUUM only supported for SQLite")

    try:
        db_path = _resolve_sqlite_db_path()
        # VACUUM нельзя выполнять внутри транзакции SQLAlchemy — используем
        # raw sqlite3 connection с isolation_level=None (autocommit).
        conn = sqlite3.connect(db_path, isolation_level=None)
        conn.execute("VACUUM")
        conn.close()

        return {"status": "ok", "message": "Database vacuumed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vacuum failed: {str(e)}")


@router.post("/db/optimize")
async def optimize_database(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Оптимизировать индексы БД (ANALYZE + VACUUM)."""
    if not settings.is_sqlite:
        raise HTTPException(
            status_code=400, detail="Optimize only supported for SQLite"
        )

    try:
        # ANALYZE можно внутри транзакции
        db.execute(text("ANALYZE"))
        db.commit()

        # VACUUM — вне транзакции через raw sqlite3
        db_path = _resolve_sqlite_db_path()
        conn = sqlite3.connect(db_path, isolation_level=None)
        conn.execute("VACUUM")
        conn.close()

        return {"status": "ok", "message": "Database optimized (ANALYZE + VACUUM)"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


@router.delete("/tasks")
async def delete_all_tasks(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Удалить все заявки (вместе с комментариями и фото)."""
    try:
        # Удаляем файлы фото с диска
        try:
            photos = db.query(TaskPhotoModel).all()
            for photo in photos:
                photo_path = settings.PHOTOS_DIR / photo.filename
                if photo_path.exists():
                    photo_path.unlink()
            db.query(TaskPhotoModel).delete()
        except Exception:
            logger.warning("Failed to delete photo files during delete_all_tasks")

        db.query(CommentModel).delete()
        db.query(TaskModel).delete()
        db.commit()

        return {"status": "ok", "message": "All tasks, comments and photos deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
