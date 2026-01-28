"""
Notification Schemas
====================
Схемы для уведомлений.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class PushNotificationRequest(BaseModel):
    """Запрос на отправку push"""
    title: str
    body: str
    task_id: Optional[int] = None
    notification_type: str = "general"
    user_ids: Optional[List[int]] = None


class NotificationBase(BaseModel):
    """Базовая схема уведомления"""
    title: str
    message: str
    type: str = "system"  # task, system, alert
    task_id: Optional[int] = None


class NotificationCreate(NotificationBase):
    """Схема создания уведомления"""
    user_id: int


class NotificationResponse(NotificationBase):
    """Схема ответа уведомления"""
    id: int
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
