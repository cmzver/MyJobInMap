"""
Photos API — тонкие контроллеры поверх PhotoService.
====================================================
Эндпоинты для работы с фотографиями заявок.
"""

from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError

from app.api.deps import TaskAccess, require_task_access
from app.models import UserModel
from app.schemas import PhotoResponse
from app.services import get_current_user_required, require_permission
from app.services.idempotency import IdempotencyKey, cached_response, stage_response
from app.services.photo_service import (
    PhotoService,
    PhotoServiceError,
    get_photo_service,
)

router = APIRouter(tags=["Photos"])


# Синхронный обработчик (пул потоков): оптимизация снимка и запросы к БД
# не держат event loop.
@router.post("/api/tasks/{task_id}/photos", response_model=PhotoResponse)
def upload_task_photo(
    task_id: int,
    photo_type: str = "completion",
    file: UploadFile = File(...),
    access: TaskAccess = Depends(
        require_task_access("add_photos", worker_detail="Нет доступа к этой заявке")
    ),
    idempotency_key: IdempotencyKey = None,
    service: PhotoService = Depends(get_photo_service),
):
    """Загрузить фото к заявке"""
    user_id = access.user.id
    scope = f"photo:{task_id}"
    cached = cached_response(service.db, user_id, idempotency_key, scope)
    if cached is not None:
        return cached

    try:
        return service.upload(
            task=access.task,
            current_user=access.user,
            photo_type=photo_type,
            filename=file.filename,
            content=file.file.read(),
            # Ответ для ключа коммитится вместе с фото: параллельный повтор
            # упрётся в уникальность ключа и откатит свою копию
            stage_response=lambda response: stage_response(
                service.db, user_id, idempotency_key, scope, response
            ),
        )
    except PhotoServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except IntegrityError:
        # Повтор, пришедший, пока первый запрос ещё обрабатывался, — отдаём его ответ
        cached = cached_response(service.db, user_id, idempotency_key, scope)
        if cached is None:
            raise
        return cached


@router.get("/api/tasks/{task_id}/photos", response_model=List[PhotoResponse])
def get_task_photos(
    task_id: int,
    access: TaskAccess = Depends(
        require_task_access("view_photos", worker_detail="Нет доступа к этой заявке")
    ),
    service: PhotoService = Depends(get_photo_service),
):
    """Получить все фото заявки"""
    return service.list_for_task(task_id)


@router.get("/api/photos/{filename}")
def get_photo(
    filename: str,
    current_user: UserModel = Depends(require_permission("view_photos")),
    service: PhotoService = Depends(get_photo_service),
):
    """Получить файл фото"""
    try:
        file_path, media_type = service.resolve_file(filename, current_user)
    except PhotoServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return FileResponse(file_path, media_type=media_type)


@router.delete("/api/photos/{photo_id}")
def delete_photo(
    photo_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    service: PhotoService = Depends(get_photo_service),
):
    """Удалить фото"""
    try:
        return service.delete(photo_id, current_user)
    except PhotoServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
