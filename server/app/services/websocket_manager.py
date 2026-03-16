"""
WebSocket Manager
=================
Менеджер WebSocket-соединений для реал-тайм уведомлений.

Использование:
    from app.services.websocket_manager import ws_manager

    # Отправка события всем подключённым клиентам
    await ws_manager.broadcast({"type": "task_updated", "task_id": 123})

    # Отправка конкретному пользователю
    await ws_manager.send_to_user(user_id=5, message={...})
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Set, Optional, TypedDict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionMeta(TypedDict):
    user_id: int
    organization_id: Optional[int]
    is_superadmin: bool


class ConnectionManager:
    """
    Менеджер WebSocket-соединений.
    
    Поддерживает:
    - Broadcast всем подключённым клиентам
    - Отправка конкретному пользователю
    - Автоматическая очистка при отключении
    - Heartbeat (ping/pong)
    """

    def __init__(self) -> None:
        # user_id -> set of WebSocket connections (один пользователь может иметь несколько вкладок)
        self._connections: Dict[int, Set[WebSocket]] = {}
        # WebSocket -> user_id (обратный маппинг)
        self._ws_to_user: Dict[WebSocket, int] = {}
        # WebSocket -> connection metadata for tenant-aware routing
        self._ws_meta: Dict[WebSocket, ConnectionMeta] = {}
        self._lock = asyncio.Lock()

    @property
    def active_connections_count(self) -> int:
        """Общее количество активных соединений"""
        return len(self._ws_to_user)

    @property
    def active_users_count(self) -> int:
        """Количество уникальных подключённых пользователей"""
        return len(self._connections)

    async def connect(
        self,
        websocket: WebSocket,
        user_id: int,
        organization_id: Optional[int] = None,
        is_superadmin: bool = False,
    ) -> None:
        """Принять WebSocket-соединение и зарегистрировать пользователя."""
        await websocket.accept()
        async with self._lock:
            if user_id not in self._connections:
                self._connections[user_id] = set()
            self._connections[user_id].add(websocket)
            self._ws_to_user[websocket] = user_id
            self._ws_meta[websocket] = {
                "user_id": user_id,
                "organization_id": organization_id,
                "is_superadmin": is_superadmin,
            }
        
        logger.info(
            "WebSocket connected: user_id=%d, total_connections=%d, unique_users=%d",
            user_id, self.active_connections_count, self.active_users_count
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        """Удалить WebSocket-соединение."""
        async with self._lock:
            user_id = self._ws_to_user.pop(websocket, None)
            self._ws_meta.pop(websocket, None)
            if user_id is not None and user_id in self._connections:
                self._connections[user_id].discard(websocket)
                if not self._connections[user_id]:
                    del self._connections[user_id]
        
        if user_id is not None:
            logger.info(
                "WebSocket disconnected: user_id=%d, total_connections=%d",
                user_id, self.active_connections_count
            )

    async def send_to_user(self, user_id: int, message: dict) -> int:
        """
        Отправить сообщение конкретному пользователю (все его вкладки).
        
        Returns:
            Количество успешно отправленных сообщений.
        """
        sent = 0
        connections = self._connections.get(user_id, set()).copy()
        stale: list[WebSocket] = []
        
        for ws in connections:
            try:
                await ws.send_json(message)
                sent += 1
            except Exception:
                stale.append(ws)
        
        # Очистка закрытых соединений
        for ws in stale:
            await self.disconnect(ws)
        
        return sent

    async def broadcast(
        self,
        message: dict,
        exclude_user_id: Optional[int] = None,
        organization_id: Optional[int] = None,
    ) -> int:
        """
        Отправить сообщение всем подключённым клиентам.
        
        Args:
            message: JSON-сериализуемый dict
            exclude_user_id: Не отправлять этому пользователю (чтобы не дублировать)
            
        Returns:
            Количество успешно отправленных сообщений.
        """
        sent = 0
        all_ws = list(self._ws_to_user.keys())
        stale: list[WebSocket] = []
        
        for ws in all_ws:
            meta = self._ws_meta.get(ws)
            user_id = meta["user_id"] if meta else self._ws_to_user.get(ws)
            if user_id == exclude_user_id:
                continue
            if organization_id is not None and meta is not None:
                if not meta["is_superadmin"] and meta["organization_id"] != organization_id:
                    continue
            try:
                await ws.send_json(message)
                sent += 1
            except Exception:
                stale.append(ws)
        
        for ws in stale:
            await self.disconnect(ws)
        
        return sent

    async def broadcast_to_roles(
        self,
        message: dict,
        user_ids: list[int],
        exclude_user_id: Optional[int] = None
    ) -> int:
        """
        Отправить сообщение списку пользователей.
        
        Args:
            message: JSON-сериализуемый dict
            user_ids: Список user_id получателей
            exclude_user_id: Исключить пользователя
        """
        sent = 0
        for uid in user_ids:
            if uid == exclude_user_id:
                continue
            sent += await self.send_to_user(uid, message)
        return sent

    def get_status(self) -> dict:
        """Информация о состоянии менеджера."""
        return {
            "active_connections": self.active_connections_count,
            "unique_users": self.active_users_count,
            "connected_user_ids": list(self._connections.keys()),
        }


# Singleton экземпляр
ws_manager = ConnectionManager()


# ============================================================================
# Вспомогательные функции для broadcast событий
# ============================================================================

def _event(event_type: str, data: dict) -> dict:
    """Стандартный формат WebSocket события."""
    return {
        "type": event_type,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def broadcast_task_created(
    task_id: int,
    task_number: str,
    title: str,
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> None:
    """Broadcast: новая заявка создана."""
    await ws_manager.broadcast(
        _event("task_created", {
            "task_id": task_id,
            "task_number": task_number,
            "title": title,
        }),
        exclude_user_id=user_id,
        organization_id=organization_id,
    )


async def broadcast_task_updated(
    task_id: int,
    task_number: str,
    changes: dict,
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> None:
    """Broadcast: заявка обновлена."""
    await ws_manager.broadcast(
        _event("task_updated", {
            "task_id": task_id,
            "task_number": task_number,
            **changes,
        }),
        exclude_user_id=user_id,
        organization_id=organization_id,
    )


async def broadcast_task_status_changed(
    task_id: int,
    task_number: str,
    old_status: str,
    new_status: str,
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> None:
    """Broadcast: статус заявки изменён."""
    await ws_manager.broadcast(
        _event("task_status_changed", {
            "task_id": task_id,
            "task_number": task_number,
            "old_status": old_status,
            "new_status": new_status,
        }),
        exclude_user_id=user_id,
        organization_id=organization_id,
    )


async def broadcast_task_assigned(
    task_id: int,
    task_number: str,
    assigned_user_id: int,
    assigned_user_name: str,
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> None:
    """Broadcast: заявка назначена."""
    # Уведомить назначенного пользователя напрямую
    await ws_manager.send_to_user(assigned_user_id, _event("task_assigned_to_me", {
        "task_id": task_id,
        "task_number": task_number,
    }))
    
    # Broadcast всем остальным
    await ws_manager.broadcast(
        _event("task_assigned", {
            "task_id": task_id,
            "task_number": task_number,
            "assigned_user_id": assigned_user_id,
            "assigned_user_name": assigned_user_name,
        }),
        exclude_user_id=user_id,
        organization_id=organization_id,
    )


async def broadcast_task_deleted(
    task_id: int,
    task_number: str,
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> None:
    """Broadcast: заявка удалена."""
    await ws_manager.broadcast(
        _event("task_deleted", {
            "task_id": task_id,
            "task_number": task_number,
        }),
        exclude_user_id=user_id,
        organization_id=organization_id,
    )
