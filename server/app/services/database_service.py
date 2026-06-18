"""
Database Service
================
Бизнес-логика инструментов БД (раздел /api/admin/db*): сидинг тестовых данных,
статистика, проверка целостности, очистка старых заявок, VACUUM/ANALYZE и
полная очистка заявок. Роутер app/api/admin/database.py — тонкий.

Низкоуровневые помощники путей SQLite и каталог бэкапов переиспользуются из
backup_service (resolve_sqlite_db_path, BACKUP_DIR).
"""

import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import Depends
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
from app.services.auth import get_password_hash
from app.services.backup_service import BACKUP_DIR, resolve_sqlite_db_path

logger = logging.getLogger(__name__)


class DatabaseServiceError(Exception):
    """Исключение инструментов БД."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class DatabaseService:
    """Сидинг, статистика и обслуживание БД (только SQLite для maintenance)."""

    def __init__(self, db: Session):
        self.db = db

    def seed(self) -> dict:
        """Добавить тестовые данные в БД (пользователи + заявки)."""
        tasks_count = self.db.query(TaskModel).count()
        if tasks_count > 0:
            raise DatabaseServiceError(
                "В базе уже есть заявки. Сначала очистите БД.", 400
            )

        try:
            users_created = 0

            seed_users = [
                ("admin", "admin", "Admin User", UserRole.ADMIN),
                ("worker1", "worker1", "Иван Полевой", UserRole.WORKER),
                ("worker2", "worker2", "Анна Сервисная", UserRole.WORKER),
            ]
            created: dict[str, UserModel] = {}
            for username, password, full_name, role in seed_users:
                user = (
                    self.db.query(UserModel)
                    .filter(UserModel.username == username)
                    .first()
                )
                if not user:
                    user = UserModel(
                        username=username,
                        password_hash=get_password_hash(password),
                        full_name=full_name,
                        role=role.value,
                        is_active=True,
                    )
                    self.db.add(user)
                    self.db.flush()
                    users_created += 1
                created[username] = user

            worker1 = created["worker1"]
            worker2 = created["worker2"]
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
                self.db.add(task)
            self.db.commit()

            return {
                "status": "ok",
                "message": "Тестовые данные загружены успешно",
                "users_created": users_created,
                "tasks_created": len(test_tasks),
            }
        except Exception as e:
            self.db.rollback()
            raise DatabaseServiceError(f"Ошибка загрузки данных: {str(e)}", 500)

    def get_stats(self) -> dict:
        """Детальная статистика БД."""
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

            tasks_count = self.db.query(TaskModel).count()
            users_count = self.db.query(UserModel).count()
            comments_count = self.db.query(CommentModel).count()
            devices_count = self.db.query(DeviceModel).count()

            photos_count = 0
            addresses_count = 0
            notifications_count = 0
            try:
                photos_count = self.db.query(TaskPhotoModel).count()
            except Exception:
                pass
            try:
                addresses_count = self.db.query(AddressModel).count()
            except Exception:
                pass
            try:
                notifications_count = self.db.query(NotificationModel).count()
            except Exception:
                pass

            tasks_new = (
                self.db.query(TaskModel).filter(TaskModel.status == "NEW").count()
            )
            tasks_in_progress = (
                self.db.query(TaskModel)
                .filter(TaskModel.status == "IN_PROGRESS")
                .count()
            )
            tasks_done = (
                self.db.query(TaskModel).filter(TaskModel.status == "DONE").count()
            )
            tasks_cancelled = (
                self.db.query(TaskModel).filter(TaskModel.status == "CANCELLED").count()
            )

            last_task = (
                self.db.query(TaskModel).order_by(TaskModel.updated_at.desc()).first()
            )
            last_activity = last_task.updated_at.isoformat() if last_task else None

            backup_count = 0
            if os.path.exists(BACKUP_DIR):
                backup_count = len(
                    [f for f in os.listdir(BACKUP_DIR) if f.endswith(".gz")]
                )

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
            raise DatabaseServiceError(str(e), 500)

    def check_integrity(self) -> dict:
        """Проверка целостности БД (PRAGMA integrity_check, только SQLite).

        Диалект определяем по реальному соединению, а не по settings: так
        проверка корректна, даже если конфиг и фактическая БД расходятся
        (напр. в тестах с подменённой сессией).
        """
        if self.db.get_bind().dialect.name != "sqlite":
            raise DatabaseServiceError("Integrity check only supported for SQLite", 400)

        try:
            result = self.db.execute(text("PRAGMA integrity_check")).fetchall()
            is_ok = len(result) == 1 and result[0][0] == "ok"

            return {
                "status": "ok" if is_ok else "error",
                "integrity": "passed" if is_ok else "failed",
                "details": [row[0] for row in result] if not is_ok else None,
                "message": (
                    "База данных в порядке"
                    if is_ok
                    else "Обнаружены проблемы целостности"
                ),
            }
        except Exception as e:
            raise DatabaseServiceError(str(e), 500)

    def cleanup_old_data(
        self,
        days: int = 90,
        include_done: bool = True,
        include_cancelled: bool = True,
    ) -> dict:
        """Удалить старые заявки (старше N дней) с комментариями и фото."""
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
                self.db.query(TaskModel)
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
                self.db.query(CommentModel)
                .filter(CommentModel.task_id.in_(task_ids))
                .delete(synchronize_session=False)
            )

            deleted_photos = 0
            try:
                photos = (
                    self.db.query(TaskPhotoModel)
                    .filter(TaskPhotoModel.task_id.in_(task_ids))
                    .all()
                )
                for photo in photos:
                    photo_path = settings.PHOTOS_DIR / photo.filename
                    if photo_path.exists():
                        photo_path.unlink()
                deleted_photos = (
                    self.db.query(TaskPhotoModel)
                    .filter(TaskPhotoModel.task_id.in_(task_ids))
                    .delete(synchronize_session=False)
                )
            except Exception:
                logger.warning("Failed to delete photos for old tasks")

            deleted_tasks = (
                self.db.query(TaskModel)
                .filter(TaskModel.id.in_(task_ids))
                .delete(synchronize_session=False)
            )

            self.db.commit()

            return {
                "status": "ok",
                "message": f"Удалены заявки старше {days} дней",
                "deleted_tasks": deleted_tasks,
                "deleted_comments": deleted_comments,
                "deleted_photos": deleted_photos,
            }
        except Exception as e:
            self.db.rollback()
            raise DatabaseServiceError(str(e), 500)

    def vacuum(self) -> dict:
        """VACUUM БД (только SQLite, через прямое sqlite3-подключение)."""
        if not settings.is_sqlite:
            raise DatabaseServiceError("VACUUM only supported for SQLite", 400)

        try:
            db_path = resolve_sqlite_db_path()
            # VACUUM нельзя выполнять внутри транзакции SQLAlchemy — используем
            # raw sqlite3 connection с isolation_level=None (autocommit).
            conn = sqlite3.connect(db_path, isolation_level=None)
            conn.execute("VACUUM")
            conn.close()

            return {"status": "ok", "message": "Database vacuumed successfully"}
        except Exception as e:
            raise DatabaseServiceError(f"Vacuum failed: {str(e)}", 500)

    def optimize(self) -> dict:
        """Оптимизировать индексы БД (ANALYZE + VACUUM, только SQLite)."""
        if not settings.is_sqlite:
            raise DatabaseServiceError("Optimize only supported for SQLite", 400)

        try:
            # ANALYZE можно внутри транзакции
            self.db.execute(text("ANALYZE"))
            self.db.commit()

            # VACUUM — вне транзакции через raw sqlite3
            db_path = resolve_sqlite_db_path()
            conn = sqlite3.connect(db_path, isolation_level=None)
            conn.execute("VACUUM")
            conn.close()

            return {"status": "ok", "message": "Database optimized (ANALYZE + VACUUM)"}
        except Exception as e:
            raise DatabaseServiceError(f"Optimization failed: {str(e)}", 500)

    def delete_all_tasks(self) -> dict:
        """Удалить все заявки (вместе с комментариями и фото)."""
        try:
            # Удаляем файлы фото с диска
            try:
                photos = self.db.query(TaskPhotoModel).all()
                for photo in photos:
                    photo_path = settings.PHOTOS_DIR / photo.filename
                    if photo_path.exists():
                        photo_path.unlink()
                self.db.query(TaskPhotoModel).delete()
            except Exception:
                logger.warning("Failed to delete photo files during delete_all_tasks")

            self.db.query(CommentModel).delete()
            self.db.query(TaskModel).delete()
            self.db.commit()

            return {"status": "ok", "message": "All tasks, comments and photos deleted"}
        except Exception as e:
            self.db.rollback()
            raise DatabaseServiceError(str(e), 500)


def get_database_service(db: Session = Depends(get_db)) -> DatabaseService:
    return DatabaseService(db)
