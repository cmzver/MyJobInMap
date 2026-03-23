"""
Device Schemas
==============
РЎС…РµРјС‹ РґР»СЏ СѓСЃС‚СЂРѕР№СЃС‚РІ.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DeviceRegister(BaseModel):
    """Р РµРіРёСЃС‚СЂР°С†РёСЏ СѓСЃС‚СЂРѕР№СЃС‚РІР°"""

    token: str
    device_name: Optional[str] = None


class DeviceResponse(BaseModel):
    """РћС‚РІРµС‚ СЃ РґР°РЅРЅС‹РјРё СѓСЃС‚СЂРѕР№СЃС‚РІР°"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: Optional[str] = None
    fcm_token: str
    device_name: Optional[str] = None
    created_at: datetime
    last_active: datetime
