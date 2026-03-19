"""
Comment Schemas
===============
РЎС…РµРјС‹ РґР»СЏ РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class CommentCreate(BaseModel):
    """РЎРѕР·РґР°РЅРёРµ РєРѕРјРјРµРЅС‚Р°СЂРёСЏ"""
    text: str = Field(..., min_length=1, max_length=1000)
    author: str = Field(default="РЎРѕС‚СЂСѓРґРЅРёРє", max_length=100)


class CommentResponse(BaseModel):
    """РћС‚РІРµС‚ СЃ РєРѕРјРјРµРЅС‚Р°СЂРёРµРј"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    task_id: int
    text: str
    author: str
    author_id: Optional[int] = None
    old_status: Optional[str] = None
    new_status: Optional[str] = None
    old_assignee: Optional[str] = None
    new_assignee: Optional[str] = None
    created_at: datetime
