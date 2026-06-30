"""
Addresses API package
======================
Базовая работа с адресами (core) и расширенная карточка объекта — системы,
оборудование, документы, контакты, история (extended). Оба роутера под
/api/addresses собираются в один. Хелпер build_task_filters_for_address
реэкспортируется для tasks.
"""

from fastapi import APIRouter

from app.api.addresses.core import router as core_router
from app.api.addresses.extended import build_task_filters_for_address
from app.api.addresses.extended import router as extended_router
from app.api.addresses.panel_actions import router as panel_actions_router

router = APIRouter()
router.include_router(core_router)
router.include_router(extended_router)
router.include_router(panel_actions_router)

__all__ = ["router", "build_task_filters_for_address"]
