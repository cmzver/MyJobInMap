"""
API Package
===========
Экспорт роутеров.
"""

from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.tasks import router as tasks_router
from app.api.photos import router as photos_router
from app.api.devices import router as devices_router
from app.api.notifications import router as notifications_router
from app.api.admin import router as admin_router
from app.api.system_settings import router as system_settings_router
from app.api.addresses import router as addresses_router
from app.api.address_extended import router as address_extended_router
from app.api.dashboard import router as dashboard_router
from app.api.finance import router as finance_router
from app.api.users import router as users_router
from app.api.reports import router as reports_router


# Главный роутер
api_router = APIRouter()

# Подключение всех роутеров
api_router.include_router(auth_router)
api_router.include_router(tasks_router)
api_router.include_router(photos_router)
api_router.include_router(devices_router)
api_router.include_router(notifications_router)
api_router.include_router(admin_router)
api_router.include_router(system_settings_router)
api_router.include_router(addresses_router)
api_router.include_router(address_extended_router)
api_router.include_router(dashboard_router)
api_router.include_router(finance_router)
api_router.include_router(users_router)
api_router.include_router(reports_router)


__all__ = ["api_router"]
