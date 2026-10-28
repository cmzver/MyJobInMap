"""
Photo Schemas
=============
РЎС…РµРјС‹ РґР»СЏ С„РѕС‚РѕРіСЂР°С„РёР№.
"""

from typing import Optional

from pydantic import BaseModel

from app.schemas.datetime_utc import UtcDateTime


class PhotoResponse(BaseModel):
    """РћС‚РІРµС‚ СЃ РёРЅС„РѕСЂРјР°С†РёРµР№ Рѕ С„РѕС‚Рѕ"""

    id: int
    task_id: int
    filename: str
    original_name: Optional[str]
    file_size: int
    mime_type: str
    photo_type: str
    url: str
    created_at: UtcDateTime
    uploaded_by: Optional[str] = None
