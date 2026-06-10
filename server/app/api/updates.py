"""
Updates API — тонкие контроллеры поверх UpdateService.
======================================================
API для управления обновлениями Android-приложения.

Endpoints:
- GET  /api/updates/check     — проверить наличие обновления (public для приложения)
- POST /api/updates/upload     — загрузить новый APK (admin only)
- GET  /api/updates/download   — скачать последний APK
- GET  /api/updates/history    — список всех версий (admin only)
- DELETE /api/updates/{version_code} — удалить версию (admin only)
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.models.user import UserModel
from app.schemas.update import AppUpdateCheck, AppUpdateInfo
from app.services.auth import get_current_superadmin
from app.services.update_service import (
    UpdateService,
    UpdateServiceError,
    get_update_service,
)

router = APIRouter(prefix="/api/updates", tags=["Updates"])


@router.get("/check", response_model=AppUpdateCheck)
async def check_update(
    version_code: int = 0,
    version_name: str = "",
    service: UpdateService = Depends(get_update_service),
):
    """
    Проверить наличие обновления.

    Вызывается из Android-приложения. Не требует авторизации.

    Args:
        version_code: Текущий version_code приложения
        version_name: Текущая версия приложения (для отображения)
    """
    return service.check_update(version_code, version_name)


@router.get("/download")
async def download_latest_apk(
    service: UpdateService = Depends(get_update_service),
):
    """
    Скачать последнюю версию APK.

    Не требует авторизации (приложение скачивает без токена).
    """
    try:
        apk_path, download_name = service.resolve_download()
    except UpdateServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return FileResponse(
        path=str(apk_path),
        filename=download_name,
        media_type="application/vnd.android.package-archive",
    )


@router.post(
    "/upload", response_model=AppUpdateInfo, status_code=status.HTTP_201_CREATED
)
async def upload_apk(
    file: UploadFile = File(..., description="APK файл"),
    version_name: str | None = Form(
        default=None, description="Версия из APK, опционально для валидации"
    ),
    version_code: int | None = Form(
        default=None, description="Код версии из APK, опционально для валидации"
    ),
    release_notes: str = Form(default="", description="Описание изменений"),
    is_mandatory: bool = Form(default=False, description="Обязательное обновление"),
    admin: UserModel = Depends(get_current_superadmin),
    service: UpdateService = Depends(get_update_service),
):
    """
    Загрузить новую версию APK. Только для администраторов.
    """
    content = await file.read()
    try:
        return service.upload(
            content=content,
            filename=file.filename,
            version_name=version_name,
            version_code=version_code,
            release_notes=release_notes,
            is_mandatory=is_mandatory,
            actor_username=admin.username,
        )
    except UpdateServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/history", response_model=list[AppUpdateInfo])
async def list_updates(
    admin: UserModel = Depends(get_current_superadmin),
    service: UpdateService = Depends(get_update_service),
):
    """
    Получить список всех загруженных версий.

    Только для администраторов. Отсортировано по version_code DESC.
    """
    return service.list_history()


@router.delete("/{version_code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_update(
    version_code: int,
    admin: UserModel = Depends(get_current_superadmin),
    service: UpdateService = Depends(get_update_service),
):
    """
    Удалить версию обновления. Только для администраторов.
    """
    try:
        service.delete(version_code, admin.username)
    except UpdateServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
