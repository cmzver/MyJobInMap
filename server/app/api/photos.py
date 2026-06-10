"""
Photos API — тонкие контроллеры поверх PhotoService.
====================================================
Эндпоинты для работы с фотографиями заявок.
"""

from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import TaskAccess, require_task_access
from app.models import UserModel
from app.schemas import PhotoResponse
from app.services import get_current_user_required, require_permission
from app.services.photo_service import (
    PhotoService,
    PhotoServiceError,
    get_photo_service,
)

router = APIRouter(tags=["Photos"])


@router.post("/api/tasks/{task_id}/photos", response_model=PhotoResponse)
async def upload_task_photo(
    task_id: int,
    photo_type: str = "completion",
    file: UploadFile = File(...),
    access: TaskAccess = Depends(
        require_task_access("add_photos", worker_detail="Нет доступа к этой заявке")
    ),
    service: PhotoService = Depends(get_photo_service),
):
    """Загрузить фото к заявке"""
    content = await file.read()
    try:
        return service.upload(
            task=access.task,
            current_user=access.user,
            photo_type=photo_type,
            filename=file.filename,
            content=content,
        )
    except PhotoServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/api/tasks/{task_id}/photos", response_model=List[PhotoResponse])
async def get_task_photos(
    task_id: int,
    access: TaskAccess = Depends(
        require_task_access("view_photos", worker_detail="Нет доступа к этой заявке")
    ),
    service: PhotoService = Depends(get_photo_service),
):
    """Получить все фото заявки"""
    return service.list_for_task(task_id)


@router.get("/api/photos/{filename}")
async def get_photo(
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
async def delete_photo(
    photo_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    service: PhotoService = Depends(get_photo_service),
):
    """Удалить фото"""
    try:
        return service.delete(photo_id, current_user)
    except PhotoServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
