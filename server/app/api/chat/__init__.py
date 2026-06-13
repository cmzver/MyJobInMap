"""
Chat API package
================
REST-эндпоинты чата, сгруппированные по доменам: разговоры
(conversations), сообщения/реакции/прочтение (messages) и вложения
(attachments). Все роутеры под /api/chat собираются в один.
"""

from fastapi import APIRouter

from app.api.chat.attachments import router as attachments_router
from app.api.chat.conversations import router as conversations_router
from app.api.chat.messages import router as messages_router

router = APIRouter()
router.include_router(conversations_router)
router.include_router(messages_router)
router.include_router(attachments_router)

__all__ = ["router"]
