"""
Comment Schemas
===============
Схемы для комментариев.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class CommentCreate(BaseModel):
    """Создание комментария"""
    text: str = Field(..., min_length=1, max_length=1000)
    author: str = Field(default="Сотрудник", max_length=100)


class CommentResponse(BaseModel):
    """Ответ с комментарием"""
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
