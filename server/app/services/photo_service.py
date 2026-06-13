"""
Photo Service
=============
Бизнес-логика фотографий заявок: валидация (расширение, размер,
magic-bytes), оптимизация, сохранение на диск + запись в БД, выдача
файла и удаление с проверкой доступа. Роутер app/api/photos.py — тонкий.
"""

import logging
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import Depends
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import TaskModel, TaskPhotoModel, UserModel, get_db
from app.schemas import PhotoResponse
from app.services.auth import check_permission, enforce_worker_task_access
from app.services.image_optimizer import image_optimizer
from app.services.tenant_filter import TenantFilter

logger = logging.getLogger(__name__)

# MIME по magic-bytes содержимого (защита от подмены расширения)
_MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"RIFF": "image/webp",  # WebP начинается RIFF....WEBP
}

_MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


class PhotoServiceError(Exception):
    """Исключение операций с фотографиями."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


def _photo_to_response(
    photo: TaskPhotoModel, uploaded_by: Optional[str]
) -> PhotoResponse:
    return PhotoResponse(
        id=photo.id,
        task_id=photo.task_id,
        filename=photo.filename,
        original_name=photo.original_name,
        file_size=photo.file_size,
        mime_type=photo.mime_type,
        photo_type=photo.photo_type,
        url=f"/api/photos/{photo.filename}",
        created_at=photo.created_at,
        uploaded_by=uploaded_by,
    )


class PhotoService:
    """Операции с фотографиями заявок поверх БД и файлового хранилища."""

    def __init__(self, db: Session):
        self.db = db

    def upload(
        self,
        *,
        task: TaskModel,
        current_user: UserModel,
        photo_type: str,
        filename: Optional[str],
        content: bytes,
    ) -> PhotoResponse:
        # Проверка расширения
        file_ext = Path(filename).suffix.lower() if filename else ""
        if file_ext not in settings.ALLOWED_EXTENSIONS:
            raise PhotoServiceError(
                "Недопустимый формат. Разрешены: "
                f"{', '.join(settings.ALLOWED_EXTENSIONS)}",
                400,
            )

        # Проверка размера (до оптимизации)
        if len(content) > settings.MAX_FILE_SIZE:
            raise PhotoServiceError(
                "Файл слишком большой. Максимум: "
                f"{settings.MAX_FILE_SIZE // 1024 // 1024} MB",
                400,
            )

        # Проверка MIME-типа по magic bytes (содержимому файла)
        detected_mime = None
        for magic, mime in _MAGIC_BYTES.items():
            if content[: len(magic)] == magic:
                detected_mime = mime
                break

        if detected_mime is None:
            raise PhotoServiceError(
                "Файл не является допустимым изображением "
                "(неверный формат содержимого)",
                400,
            )

        # Оптимизация изображения (сжатие, ресайз)
        original_size = len(content)
        content, file_ext, mime_type = image_optimizer.optimize(
            content, file_ext, self.db
        )
        optimized_size = len(content)

        if original_size != optimized_size:
            logger.info(
                "Photo optimized: %d KB -> %d KB",
                original_size // 1024,
                optimized_size // 1024,
            )

        # Сохранение
        unique_name = f"{task.id}_{uuid.uuid4().hex[:8]}{file_ext}"
        file_path = settings.PHOTOS_DIR / unique_name

        try:
            with open(file_path, "wb") as f:
                f.write(content)
        except IOError as e:
            logger.error("File write error: %s", e)
            raise PhotoServiceError("Ошибка сохранения файла", 500)

        photo = TaskPhotoModel(
            task_id=task.id,
            filename=unique_name,
            original_name=filename,
            file_size=len(content),
            mime_type=mime_type,
            photo_type=photo_type,
            uploaded_by_id=current_user.id,
        )
        self.db.add(photo)
        self.db.commit()
        self.db.refresh(photo)

        return _photo_to_response(
            photo, current_user.full_name or current_user.username
        )

    def list_for_task(self, task_id: int) -> List[PhotoResponse]:
        # Оптимизированный запрос с JOIN вместо N+1 запросов
        photos = (
            self.db.query(TaskPhotoModel)
            .options(joinedload(TaskPhotoModel.uploaded_by))
            .filter(TaskPhotoModel.task_id == task_id)
            .all()
        )
        return [
            _photo_to_response(
                photo, photo.uploaded_by.full_name if photo.uploaded_by else None
            )
            for photo in photos
        ]

    def resolve_file(self, filename: str, current_user: UserModel) -> tuple[Path, str]:
        """Вернуть путь к файлу фото и media_type с проверкой доступа."""
        if Path(filename).name != filename:
            raise PhotoServiceError("Фото не найдено", 404)

        photo = (
            self.db.query(TaskPhotoModel)
            .filter(TaskPhotoModel.filename == filename)
            .first()
        )
        if not photo:
            raise PhotoServiceError("Фото не найдено", 404)

        task = self.db.query(TaskModel).filter(TaskModel.id == photo.task_id).first()
        if not task:
            raise PhotoServiceError("Заявка не найдена", 404)

        enforce_worker_task_access(
            current_user, task, detail="Нет доступа к чужой заявке"
        )

        file_path = settings.PHOTOS_DIR / filename
        if not file_path.exists():
            raise PhotoServiceError("Фото не найдено", 404)

        ext = Path(filename).suffix.lower()
        media_type = _MIME_BY_EXT.get(ext, "image/jpeg")
        return file_path, media_type

    def delete(self, photo_id: int, current_user: UserModel) -> dict:
        photo = (
            self.db.query(TaskPhotoModel).filter(TaskPhotoModel.id == photo_id).first()
        )
        if not photo:
            raise PhotoServiceError("Фото не найдено", 404)

        task = self.db.query(TaskModel).filter(TaskModel.id == photo.task_id).first()
        if not task:
            raise PhotoServiceError("Заявка не найдена", 404)

        TenantFilter(current_user).enforce_access(
            task, detail="Нет доступа к фото этой заявки"
        )

        # Проверка прав на удаление фото
        if not check_permission(self.db, current_user, "delete_photos"):
            # Разрешаем удалять свои фото, если нет глобальных прав
            if photo.uploaded_by_id != current_user.id:
                raise PhotoServiceError("Нет прав на удаление", 403)

        file_path = settings.PHOTOS_DIR / photo.filename
        if file_path.exists():
            file_path.unlink()

        self.db.delete(photo)
        self.db.commit()

        return {"message": "Фото удалено"}


def get_photo_service(db: Session = Depends(get_db)) -> PhotoService:
    return PhotoService(db)
