"""
Support ticket schemas.
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import (
    SupportTicketCategory,
    SupportTicketCommentType,
    SupportTicketStatus,
)
from app.schemas.datetime_utc import UtcDateTime


class SupportTicketReporter(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    # Свободная строка: роль может быть кастомной группой, не только встроенным enum.
    role: str
    organization_id: Optional[int] = None


class SupportTicketCreate(BaseModel):
    title: str = Field(..., min_length=4, max_length=200)
    description: str = Field(..., min_length=10, max_length=4000)
    category: SupportTicketCategory = SupportTicketCategory.FEEDBACK

    @field_validator("title", "description")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Field cannot be empty")
        return normalized


class SupportTicketUpdate(BaseModel):
    status: Optional[SupportTicketStatus] = None
    admin_response: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("admin_response")
    @classmethod
    def normalize_admin_response(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class SupportTicketCommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Field cannot be empty")
        return normalized


class SupportTicketCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    comment_type: SupportTicketCommentType
    body: Optional[str] = None
    old_status: Optional[SupportTicketStatus] = None
    new_status: Optional[SupportTicketStatus] = None
    created_at: UtcDateTime
    author: SupportTicketReporter


class SupportTicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    category: SupportTicketCategory
    status: SupportTicketStatus
    admin_response: Optional[str] = None
    organization_id: Optional[int] = None
    created_at: UtcDateTime
    updated_at: UtcDateTime
    resolved_at: Optional[UtcDateTime] = None
    created_by: SupportTicketReporter


class SupportTicketDetailResponse(SupportTicketResponse):
    comments: list[SupportTicketCommentResponse] = Field(default_factory=list)
