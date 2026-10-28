"""
Admin API package
==================
Эндпоинты под /api/admin* собираются в единый router. Сюда же отнесён
публичный read-роутер настроек (public_router, /api/public) — он живёт рядом
с админскими настройками и реэкспортируется для монтирования в app.api.
"""

from fastapi import APIRouter

from app.api.admin.backups import router as backups_router
from app.api.admin.custom_fields import router as custom_fields_router
from app.api.admin.database import router as database_router
from app.api.admin.devices import router as devices_router
from app.api.admin.organizations import router as organizations_router
from app.api.admin.permissions import router as permissions_router
from app.api.admin.security import router as security_router
from app.api.admin.settings import public_router
from app.api.admin.settings import router as settings_router
from app.api.admin.system import router as system_router
from app.api.admin.tasks import router as tasks_router
from app.api.admin.users import router as users_router

router = APIRouter()
router.include_router(tasks_router)
router.include_router(devices_router)
router.include_router(custom_fields_router)
router.include_router(permissions_router)
router.include_router(users_router)
router.include_router(backups_router)
router.include_router(database_router)
router.include_router(security_router)
router.include_router(settings_router)
router.include_router(organizations_router)
router.include_router(system_router)

__all__ = ["router", "public_router"]
