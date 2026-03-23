"""
Photo Schemas
=============
РЎС…РµРјС‹ РґР»СЏ С„РѕС‚РѕРіСЂР°С„РёР№.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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
    created_at: datetime
    uploaded_by: Optional[str] = None
