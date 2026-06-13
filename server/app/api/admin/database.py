"""
Admin Database Tools API
========================
Тонкие контроллеры инструментов БД (логика — в DatabaseService): сидинг,
статистика, целостность, очистка, VACUUM/ANALYZE и полная очистка заявок.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.models import UserModel
from app.services import get_current_superadmin
from app.services.database_service import (
    DatabaseService,
    DatabaseServiceError,
    get_database_service,
)

router = APIRouter(prefix="/api/admin", tags=["Admin - Backups & DB"])


@router.post("/db/seed")
async def seed_database(
    admin: UserModel = Depends(get_current_superadmin),
    service: DatabaseService = Depends(get_database_service),
):
    """Добавить тестовые данные в БД."""
    try:
        return service.seed()
    except DatabaseServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/db/stats")
async def get_database_stats(
    admin: UserModel = Depends(get_current_superadmin),
    service: DatabaseService = Depends(get_database_service),
):
    """Получить детальную статистику БД."""
    try:
        return service.get_stats()
    except DatabaseServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/db/integrity")
async def check_database_integrity(
    admin: UserModel = Depends(get_current_superadmin),
    service: DatabaseService = Depends(get_database_service),
):
    """Проверить целостность БД (PRAGMA integrity_check)."""
    try:
        return service.check_integrity()
    except DatabaseServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/db/cleanup")
async def cleanup_old_data(
    days: int = 90,
    include_done: bool = True,
    include_cancelled: bool = True,
    admin: UserModel = Depends(get_current_superadmin),
    service: DatabaseService = Depends(get_database_service),
):
    """
    Удалить старые заявки (старше N дней).

    - days: количество дней (по умолчанию 90)
    - include_done: удалять выполненные заявки
    - include_cancelled: удалять отменённые заявки
    """
    try:
        return service.cleanup_old_data(days, include_done, include_cancelled)
    except DatabaseServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/db/vacuum")
async def vacuum_database(
    admin: UserModel = Depends(get_current_superadmin),
    service: DatabaseService = Depends(get_database_service),
):
    """Оптимизировать БД (VACUUM). Использует прямое sqlite3-подключение."""
    try:
        return service.vacuum()
    except DatabaseServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/db/optimize")
async def optimize_database(
    admin: UserModel = Depends(get_current_superadmin),
    service: DatabaseService = Depends(get_database_service),
):
    """Оптимизировать индексы БД (ANALYZE + VACUUM)."""
    try:
        return service.optimize()
    except DatabaseServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.delete("/tasks")
async def delete_all_tasks(
    admin: UserModel = Depends(get_current_superadmin),
    service: DatabaseService = Depends(get_database_service),
):
    """Удалить все заявки (вместе с комментариями и фото)."""
    try:
        return service.delete_all_tasks()
    except DatabaseServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
