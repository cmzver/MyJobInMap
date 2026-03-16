"""
WebSocket API
=============
Эндпоинт для реал-тайм WebSocket уведомлений.

Клиент подключается: ws://host:8001/ws?token=JWT_TOKEN
Получает JSON события: task_created, task_updated, task_status_changed, task_assigned, task_deleted
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError

from app.config import settings
from app.models import SessionLocal, UserModel, UserRole
from app.services.websocket_manager import ws_manager

router = APIRouter(tags=["WebSocket"])
logger = logging.getLogger(__name__)


def _authenticate_websocket_user(token: str) -> tuple[int, int | None, bool] | None:
    """Проверить JWT и пользователя в БД. Возвращает user_id, organization_id, is_superadmin."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            return None
        user_id = payload.get("user_id")
        username = payload.get("sub")
        if not isinstance(user_id, int):
            return None
    except JWTError:
        return None

    db = SessionLocal()
    try:
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if user is None or not user.is_active:
            return None
        if username and user.username != username:
            return None
        if user.organization_id and user.organization and not user.organization.is_active:
            return None
        is_superadmin = user.organization_id is None and user.role == UserRole.ADMIN.value
        return user.id, user.organization_id, is_superadmin
    finally:
        db.close()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=""),
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
    auth_context = _authenticate_websocket_user(token)
    if auth_context is None:
        await websocket.close(code=4001, reason="Invalid or missing token")
        return

    user_id, organization_id, is_superadmin = auth_context

    await ws_manager.connect(websocket, user_id, organization_id=organization_id, is_superadmin=is_superadmin)
    
    try:
        while True:
            # Ожидаем сообщения от клиента (ping/pong keepalive)
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WebSocket error for user %d: %s", user_id, e)
    finally:
        await ws_manager.disconnect(websocket)
