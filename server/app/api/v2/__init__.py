"""
API v2 — новые и изменённые эндпоинты
======================================
Этот пакет содержит эндпоинты, специфичные для v2 API.

Все v1 эндпоинты автоматически доступны в v2.
v2-specific роутеры добавляют новые или переопределяют существующие эндпоинты.
"""

from fastapi import APIRouter

from app.api.v2.tasks import router as tasks_v2_router
from app.api.v2.meta import router as meta_v2_router

v2_router = APIRouter()
v2_router.include_router(meta_v2_router)
v2_router.include_router(tasks_v2_router)

__all__ = ["v2_router"]
