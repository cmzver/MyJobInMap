"""
Photos API
==========
Эндпоинты для работы с фотографиями.
"""

import logging
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import TaskAccess, require_task_access
from app.config import settings
from app.models import TaskModel, TaskPhotoModel, UserModel, get_db
from app.schemas import PhotoResponse
from app.services import (check_permission, enforce_worker_task_access,
                          get_current_user_required, image_optimizer,
                          require_permission)
from app.services.tenant_filter import TenantFilter

router = APIRouter(tags=["Photos"])

logger = logging.getLogger(__name__)


@router.post("/api/tasks/{task_id}/photos", response_model=PhotoResponse)
async def upload_task_photo(
    task_id: int,
    photo_type: str = "completion",
    file: UploadFile = File(...),
    access: TaskAccess = Depends(
        require_task_access("add_photos", worker_detail="Нет доступа к этой заявке")
    ),
    db: Session = Depends(get_db),
):
    """Загрузить фото к заявке"""
    task = access.task
    current_user = access.user

    # Проверка прав на добавление фото

    # Для worker'а - дополнительная проверка на свою заявку

    # Проверка расширения
    file_ext = Path(file.filename).suffix.lower() if file.filename else ""
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый формат. Разрешены: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )

    # Проверка размера (до оптимизации)
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Файл слишком большой. Максимум: {settings.MAX_FILE_SIZE // 1024 // 1024} MB",
        )

    # Проверка MIME-типа по magic bytes (содержимому файла)
    _MAGIC_BYTES = {
        b"\xff\xd8\xff": "image/jpeg",
        b"\x89PNG\r\n\x1a\n": "image/png",
        b"RIFF": "image/webp",  # WebP начинается RIFF....WEBP
    }
    detected_mime = None
    for magic, mime in _MAGIC_BYTES.items():
        if content[: len(magic)] == magic:
            detected_mime = mime
            break

    if detected_mime is None:
        raise HTTPException(
            status_code=400,
            detail="Файл не является допустимым изображением (неверный формат содержимого)",
        )

    # Оптимизация изображения (сжатие, ресайз)
    original_size = len(content)
    content, file_ext, mime_type = image_optimizer.optimize(content, file_ext)
    optimized_size = len(content)

    if original_size != optimized_size:
        logger.info(
            "Photo optimized: %d KB -> %d KB",
            original_size // 1024,
            optimized_size // 1024,
        )

    # Сохранение
    unique_name = f"{task_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = settings.PHOTOS_DIR / unique_name

    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except IOError as e:
        logger.error("File write error: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка сохранения файла")

    photo = TaskPhotoModel(
        task_id=task_id,
        filename=unique_name,
        original_name=file.filename,
        file_size=len(content),
        mime_type=mime_type,
        photo_type=photo_type,
        uploaded_by_id=current_user.id,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

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
        uploaded_by=current_user.full_name or current_user.username,
    )


@router.get("/api/tasks/{task_id}/photos", response_model=List[PhotoResponse])
async def get_task_photos(
    task_id: int,
    access: TaskAccess = Depends(
        require_task_access("view_photos", worker_detail="Нет доступа к этой заявке")
    ),
    db: Session = Depends(get_db),
):
    """Получить все фото заявки"""
    from sqlalchemy.orm import joinedload

    # Оптимизированный запрос с JOIN вместо N+1 запросов
    photos = (
        db.query(TaskPhotoModel)
        .options(joinedload(TaskPhotoModel.uploaded_by))
        .filter(TaskPhotoModel.task_id == task_id)
        .all()
    )

    return [
        PhotoResponse(
            id=photo.id,
            task_id=photo.task_id,
            filename=photo.filename,
            original_name=photo.original_name,
            file_size=photo.file_size,
            mime_type=photo.mime_type,
            photo_type=photo.photo_type,
            url=f"/api/photos/{photo.filename}",
            created_at=photo.created_at,
            uploaded_by=photo.uploaded_by.full_name if photo.uploaded_by else None,
        )
        for photo in photos
    ]


@router.get("/api/photos/{filename}")
async def get_photo(
    filename: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_permission("view_photos")),
):
    """Получить файл фото"""
    if Path(filename).name != filename:
        raise HTTPException(status_code=404, detail="Фото не найдено")

    photo = db.query(TaskPhotoModel).filter(TaskPhotoModel.filename == filename).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Фото не найдено")

    task = db.query(TaskModel).filter(TaskModel.id == photo.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    enforce_worker_task_access(current_user, task, detail="Нет доступа к чужой заявке")

    file_path = settings.PHOTOS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Фото не найдено")

    ext = Path(filename).suffix.lower()
    mime_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    media_type = mime_types.get(ext, "image/jpeg")

    return FileResponse(file_path, media_type=media_type)


@router.delete("/api/photos/{photo_id}")
async def delete_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user_required),
):
    """Удалить фото"""
    photo = db.query(TaskPhotoModel).filter(TaskPhotoModel.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Фото не найдено")

    task = db.query(TaskModel).filter(TaskModel.id == photo.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    TenantFilter(current_user).enforce_access(
        task, detail="Нет доступа к фото этой заявки"
    )

    # Проверка прав на удаление фото
    if not check_permission(db, current_user, "delete_photos"):
        # Разрешаем удалять свои фото, если нет глобальных прав
        if photo.uploaded_by_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав на удаление")

    file_path = settings.PHOTOS_DIR / photo.filename
    if file_path.exists():
        file_path.unlink()

    db.delete(photo)
    db.commit()

    return {"message": "Фото удалено"}
