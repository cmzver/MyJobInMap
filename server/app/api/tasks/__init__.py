"""
Tasks API package
=================
Эндпоинты для работы с заявками: CRUD/назначение (core), комментарии
(comments) и создание из текста диспетчерской (text_import). Все роутеры
под /api/tasks собираются в один.
"""

from fastapi import APIRouter

from app.api.tasks.comments import router as comments_router
from app.api.tasks.core import router as core_router
from app.api.tasks.text_import import router as text_import_router

router = APIRouter()
router.include_router(core_router)
router.include_router(comments_router)
router.include_router(text_import_router)

__all__ = ["router"]
