"""
Admin Backups API
=================
Тонкие контроллеры бэкапов БД (логика — в BackupService): список, создание,
настройки, скачивание, удаление и восстановление. Инструменты БД (seed/stats/
integrity/cleanup/vacuum/optimize/delete-all) живут в app/api/admin/database.py.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.models import UserModel
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
)

router = APIRouter(prefix="/api/admin", tags=["Admin - Backups & DB"])


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
