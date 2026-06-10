"""
Admin Backups & Database API
=============================
Тонкие контроллеры бэкапов (логика — в BackupService) и инструменты БД
(seed, статистика, целостность, очистка, VACUUM/ANALYZE).
"""

import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    CommentModel,
    DeviceModel,
    TaskModel,
    TaskPhotoModel,
    TaskPriority,
    UserModel,
    UserRole,
    get_db,
)
from app.models.address import AddressModel
from app.models.notification import NotificationModel
from app.schemas import (
    BackupListResponse,
    BackupSettingsResponse,
    BackupSettingsSchema,
)
from app.services import (
    BackupService,
    BackupServiceError,
    get_backup_service,
    get_current_superadmin,
    get_password_hash,
)
from app.services.backup_service import BACKUP_DIR, resolve_sqlite_db_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin - Backups & DB"])


# ============================================================================
# Backups — тонкие контроллеры поверх BackupService
# ============================================================================


@router.get("/backups", response_model=BackupListResponse)
async def list_backups(
    admin: UserModel = Depends(get_current_superadmin),
    service: BackupService = Depends(get_backup_service),
):
    """Список бэкапов."""
    return {"backups": service.list_backups()}


@router.post("/backups")
async def run_backup(
    admin: UserModel = Depends(get_current_superadmin),
    service: BackupService = Depends(get_backup_service),
):
    """Создать бэкап БД (только SQLite)."""
    try:
        filename = service.create_backup(admin)
    except BackupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"status": "ok", "filename": filename}


# -- Backup settings --------------------------------------------------------


@router.get("/backups/settings", response_model=BackupSettingsResponse)
async def get_backup_settings(
    admin: UserModel = Depends(get_current_superadmin),
    service: BackupService = Depends(get_backup_service),
):
    """Получить настройки резервного копирования."""
    return service.get_settings()


@router.patch("/backups/settings", response_model=BackupSettingsResponse)
async def update_backup_settings(
    settings_data: BackupSettingsSchema,
    admin: UserModel = Depends(get_current_superadmin),
    service: BackupService = Depends(get_backup_service),
):
    """Обновить настройки резервного копирования."""
    return service.update_settings(settings_data)


# -- Backup file operations --------------------------------------------------


@router.get("/backups/{filename}/download")
async def download_backup(
    filename: str,
    admin: UserModel = Depends(get_current_superadmin),
    service: BackupService = Depends(get_backup_service),
):
    """Скачать бэкап."""
    try:
        file_path = service.resolve_backup_path(filename)
    except BackupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return FileResponse(file_path, media_type="application/gzip", filename=filename)


@router.delete("/backups/{filename}")
async def delete_backup(
    filename: str,
    admin: UserModel = Depends(get_current_superadmin),
    service: BackupService = Depends(get_backup_service),
):
    """Удалить бэкап."""
    try:
        service.delete_backup(filename, admin)
    except BackupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"status": "ok", "message": f"Backup {filename} deleted"}


@router.post("/backups/{filename}/restore")
async def restore_backup(
    filename: str,
    admin: UserModel = Depends(get_current_superadmin),
    service: BackupService = Depends(get_backup_service),
):
    """
    Восстановить БД из бэкапа.

    Процесс: бэкап текущего состояния (pre_restore_*) → распаковка и валидация
    выбранного бэкапа → замена текущей БД.

    ВАЖНО: После восстановления рекомендуется перезапустить сервер!
    """
    try:
        return service.restore_backup(filename, admin)
    except BackupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


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
        db_path = resolve_sqlite_db_path()
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
        db_path = resolve_sqlite_db_path()
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
