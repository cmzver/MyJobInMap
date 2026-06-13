"""
API Package
===========
Export routers. Все эндпоинты монтируются под /api/.
"""

from fastapi import APIRouter

from app.api.addresses import router as addresses_router
from app.api.admin import public_router as public_settings_router
from app.api.admin import router as admin_router
from app.api.analytics import router as analytics_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.devices import router as devices_router
from app.api.notifications import router as notifications_router
from app.api.photos import router as photos_router
from app.api.support import router as support_router
from app.api.tasks import router as tasks_router
from app.api.updates import router as updates_router
from app.api.users import router as users_router
from app.api.websocket import router as websocket_router

# Главный роутер
api_router = APIRouter()

# Подключение всех роутеров
api_router.include_router(auth_router)
api_router.include_router(tasks_router)
api_router.include_router(photos_router)
api_router.include_router(devices_router)
api_router.include_router(notifications_router)
api_router.include_router(admin_router)
api_router.include_router(public_settings_router)
api_router.include_router(addresses_router)
api_router.include_router(users_router)
api_router.include_router(analytics_router)
api_router.include_router(websocket_router)
api_router.include_router(updates_router)
api_router.include_router(chat_router)
api_router.include_router(support_router)


__all__ = ["api_router"]
