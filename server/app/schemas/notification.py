"""
Notification Schemas
====================
РЎС…РµРјС‹ РґР»СЏ СѓРІРµРґРѕРјР»РµРЅРёР№.
"""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.datetime_utc import UtcDateTime


class PushNotificationRequest(BaseModel):
    """Р—Р°РїСЂРѕСЃ РЅР° РѕС‚РїСЂР°РІРєСѓ push"""

    title: str
    body: str
    task_id: Optional[int] = None
    notification_type: str = "general"
    user_ids: Optional[List[int]] = None


class NotificationBase(BaseModel):
    """Р‘Р°Р·РѕРІР°СЏ СЃС…РµРјР° СѓРІРµРґРѕРјР»РµРЅРёСЏ"""

    title: str
    message: str
    type: str = "system"  # task, system, alert, support
    task_id: Optional[int] = None
    support_ticket_id: Optional[int] = None
    conversation_id: Optional[int] = None


class NotificationCreate(NotificationBase):
    """РЎС…РµРјР° СЃРѕР·РґР°РЅРёСЏ СѓРІРµРґРѕРјР»РµРЅРёСЏ"""

    user_id: int


class NotificationResponse(NotificationBase):
    """РЎС…РµРјР° РѕС‚РІРµС‚Р° СѓРІРµРґРѕРјР»РµРЅРёСЏ"""

    id: int
    is_read: bool
    created_at: UtcDateTime

    model_config = ConfigDict(from_attributes=True)
