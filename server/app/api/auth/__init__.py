"""
Auth API package
================
Эндпоинты аутентификации, сгруппированные по доменам: выдача/ротация
токенов (session) и самообслуживание учётной записи (account). Оба
роутера под /api/auth собираются в один.
"""

from fastapi import APIRouter

from app.api.auth.account import router as account_router
from app.api.auth.session import router as session_router

router = APIRouter()
router.include_router(session_router)
router.include_router(account_router)

__all__ = ["router"]
