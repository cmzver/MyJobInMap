"""
Photo Schemas
=============
Схемы для фотографий.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class PhotoResponse(BaseModel):
    """Ответ с информацией о фото"""
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
