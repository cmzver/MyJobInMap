"""
API Package
===========
Export routers.

Versioning:
- /api/      - current version (v1, backward compatible)
- /api/v2/   - v2-specific endpoints (envelope format, summary, etc.)
"""

from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.tasks import router as tasks_router
from app.api.photos import router as photos_router
from app.api.devices import router as devices_router
from app.api.notifications import router as notifications_router
from app.api.admin import router as admin_router
from app.api.admin_users import router as admin_users_router
from app.api.admin_backups import router as admin_backups_router
from app.api.system_settings import router as system_settings_router, public_router as public_settings_router
from app.api.addresses import router as addresses_router
from app.api.address_extended import router as address_extended_router
from app.api.dashboard import router as dashboard_router
from app.api.finance import router as finance_router
from app.api.users import router as users_router
from app.api.reports import router as reports_router
from app.api.sla import router as sla_router
from app.api.websocket import router as websocket_router
from app.api.organizations import router as organizations_router
from app.api.updates import router as updates_router
from app.api.chat import router as chat_router


def _build_api_router() -> APIRouter:
    """Build main API router (all /api/... endpoints)."""
    router = APIRouter()
    router.include_router(auth_router)
    router.include_router(tasks_router)
    router.include_router(photos_router)
    router.include_router(devices_router)
    router.include_router(notifications_router)
    router.include_router(admin_router)
    router.include_router(admin_users_router)
    router.include_router(admin_backups_router)
    router.include_router(system_settings_router)
    router.include_router(public_settings_router)
    router.include_router(addresses_router)
    router.include_router(address_extended_router)
    router.include_router(dashboard_router)
    router.include_router(finance_router)
    router.include_router(users_router)
    router.include_router(reports_router)
    router.include_router(sla_router)
    router.include_router(websocket_router)
    router.include_router(organizations_router)
    router.include_router(updates_router)
    router.include_router(chat_router)
    return router


# Main router (backward compatible: /api/...)
api_router = _build_api_router()


def get_v2_router() -> APIRouter:
    """
    Build v2 router (v2-specific endpoints only).

    Mounted at /api/v2 - envelope format endpoints.
    All v1 endpoints remain accessible via /api/*.
    """
    from app.api.v2 import v2_router as v2_specific

    router = APIRouter()
    router.include_router(v2_specific)
    return router


__all__ = ["api_router", "get_v2_router"]
