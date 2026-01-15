"""
Device Schemas
==============
Схемы для устройств.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class DeviceRegister(BaseModel):
    """Регистрация устройства"""
    token: str
    device_name: Optional[str] = None


class DeviceResponse(BaseModel):
    """Ответ с данными устройства"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    user_id: int
    user_name: Optional[str] = None
    fcm_token: str
    device_name: Optional[str] = None
    created_at: datetime
    last_active: datetime
