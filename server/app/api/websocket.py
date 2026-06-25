"""
WebSocket API
=============
Эндпоинт для реал-тайм WebSocket уведомлений.

Клиент подключается: ws://host:8001/ws?token=JWT_TOKEN
Получает JSON события: task_created, task_updated, task_status_changed, task_assigned, task_deleted
"""

import logging
import time

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserModel, UserRole
from app.models.base import get_db
from app.models.chat import ConversationMemberModel
from app.services.chat_service import mark_as_read
from app.services.websocket_manager import ws_manager

router = APIRouter(tags=["WebSocket"])

# Кэш состава чатов для typing-индикатора: conv_id -> (monotonic_ts, [user_id]).
# Короткий TTL — typing не требует строгой свежести, зато не бьём в БД на каждый
# keystroke и не блокируем event loop.
_member_cache: dict[int, tuple[float, list[int]]] = {}
_MEMBER_CACHE_TTL = 30.0


def _get_conversation_member_ids_cached(db: Session, conv_id: int) -> list[int]:
    """Список user_id участников чата с TTL-кэшем (sync, вызывать в threadpool)."""
    now = time.monotonic()
    cached = _member_cache.get(conv_id)
    if cached is not None and now - cached[0] < _MEMBER_CACHE_TTL:
        return cached[1]
    member_ids = [
        m[0]
        for m in db.query(ConversationMemberModel.user_id)
        .filter(ConversationMemberModel.conversation_id == conv_id)
        .all()
    ]
    _member_cache[conv_id] = (now, member_ids)
    return member_ids


logger = logging.getLogger(__name__)


def _authenticate_websocket_user(
    token: str, db: Session
) -> tuple[int, int | None, bool] | None:
    """Проверить JWT и пользователя в БД. Возвращает user_id, organization_id, is_superadmin."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != "access":
            return None
        user_id = payload.get("user_id")
        username = payload.get("sub")
        if not isinstance(user_id, int):
            return None
    except JWTError:
        return None

    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if user is None or not user.is_active:
        return None
    if username and user.username != username:
        return None
    if user.organization_id and user.organization and not user.organization.is_active:
        return None
    is_superadmin = user.organization_id is None and user.role == UserRole.ADMIN.value
    return user.id, user.organization_id, is_superadmin


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=""),
    db: Session = Depends(get_db),
):
    """
    WebSocket endpoint для реал-тайм уведомлений.

    Подключение:
        ws://localhost:8001/ws?token=<JWT_TOKEN>

    Формат сообщений (сервер → клиент):
    ```json
    {
        "type": "task_created|task_updated|task_status_changed|task_assigned|task_deleted",
        "data": { ... },
        "timestamp": "2026-02-15T12:00:00+00:00"
    }
    ```

    Клиент может отправлять ping для keepalive:
    ```json
    {"type": "ping"}
    ```
    """
    # Аутентификация по JWT
    auth_context = _authenticate_websocket_user(token, db)
    if auth_context is None:
        await websocket.close(code=4001, reason="Invalid or missing token")
        return

    user_id, organization_id, is_superadmin = auth_context

    await ws_manager.connect(
        websocket, user_id, organization_id=organization_id, is_superadmin=is_superadmin
    )

    try:
        while True:
            # Ожидаем сообщения от клиента (ping/pong keepalive + chat events)
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "chat_typing":
                # Рассылка typing indicator участникам чата.
                # Состав берём из TTL-кэша; членство проверяем по нему же.
                conv_id = data.get("conversation_id")
                if conv_id:
                    member_ids = await run_in_threadpool(
                        _get_conversation_member_ids_cached, db, conv_id
                    )
                    if user_id not in member_ids:
                        continue
                    await ws_manager.send_to_conversation(
                        member_ids,
                        {
                            "type": "chat_typing",
                            "data": {
                                "conversation_id": conv_id,
                                "user_id": user_id,
                                "is_typing": data.get("is_typing", True),
                            },
                        },
                        exclude_user_id=user_id,
                    )
            elif msg_type == "chat_read":
                # Mark as read через WebSocket (sync DB → threadpool).
                conv_id = data.get("conversation_id")
                last_message_id = data.get("last_message_id")
                if conv_id and last_message_id:
                    await run_in_threadpool(
                        mark_as_read, db, conv_id, user_id, last_message_id
                    )
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WebSocket error for user %d: %s", user_id, e)
    finally:
        await ws_manager.disconnect(websocket)
