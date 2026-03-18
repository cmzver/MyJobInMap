"""
Chat Schemas
=============
Pydantic-схемы для чата: разговоры, сообщения, реакции, прочтение.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


# ========== Conversations ==========

class ConversationCreate(BaseModel):
    """Создание разговора"""
    type: str = Field(..., description="Тип: direct, group, org_general")
    name: Optional[str] = Field(None, max_length=200, description="Название (для group/org_general)")
    task_id: Optional[int] = Field(None, description="ID заявки (для type=task)")
    member_user_ids: List[int] = Field(default_factory=list, description="ID участников")


class ConversationUpdate(BaseModel):
    """Обновление разговора"""
    name: Optional[str] = Field(None, max_length=200)
    avatar_url: Optional[str] = Field(None, max_length=500)


class MemberInfo(BaseModel):
    """Информация об участнике"""
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    username: str
    full_name: str
    avatar_url: Optional[str] = None
    role: str  # owner, admin, member
    last_read_message_id: Optional[int] = None
    is_muted: bool = False
    is_archived: bool = False
    joined_at: datetime


class LastMessagePreview(BaseModel):
    """Превью последнего сообщения для списка чатов"""
    id: int
    text: Optional[str] = None
    sender_name: str
    message_type: str = "text"
    created_at: datetime


class ConversationResponse(BaseModel):
    """Полный ответ разговора"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    task_id: Optional[int] = None
    organization_id: Optional[int] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class ConversationDetailResponse(ConversationResponse):
    """Детальный ответ с участниками"""
    members: List[MemberInfo] = []


class ConversationListItem(BaseModel):
    """Элемент списка чатов"""
    id: int
    type: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    task_id: Optional[int] = None
    last_message: Optional[LastMessagePreview] = None
    unread_count: int = 0
    unread_mention_count: int = 0
    is_muted: bool = False
    is_archived: bool = False
    updated_at: Optional[datetime] = None


# ========== Messages ==========

class MessageCreate(BaseModel):
    """Создание сообщения"""
    text: Optional[str] = Field(None, max_length=5000, description="Текст сообщения")
    reply_to_id: Optional[int] = Field(None, description="ID сообщения для ответа")
    message_type: str = Field("text", description="Тип: text, image, file, system")


class MessageUpdate(BaseModel):
    """Редактирование сообщения"""
    text: str = Field(..., min_length=1, max_length=5000)


class AttachmentResponse(BaseModel):
    """Ответ с вложением"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_name: str
    file_path: Optional[str] = None
    file_size: int
    mime_type: str
    thumbnail_path: Optional[str] = None


class ReactionInfo(BaseModel):
    """Информация о реакции"""
    emoji: str
    count: int
    user_ids: List[int] = []
    user_names: List[str] = []


class MentionInfo(BaseModel):
    """Информация об упоминании"""
    user_id: int
    username: str
    offset: int
    length: int


class ReplyPreview(BaseModel):
    """Превью цитируемого сообщения"""
    id: int
    text: Optional[str] = None
    sender_id: int
    sender_name: str


class MessageResponse(BaseModel):
    """Полный ответ сообщения"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_id: int
    sender_name: str
    sender_username: str
    text: Optional[str] = None
    message_type: str = "text"
    reply_to: Optional[ReplyPreview] = None
    attachments: List[AttachmentResponse] = []
    reactions: List[ReactionInfo] = []
    mentions: List[MentionInfo] = []
    is_edited: bool = False
    is_deleted: bool = False
    created_at: datetime
    edited_at: Optional[datetime] = None


class MessageListResponse(BaseModel):
    """Список сообщений с курсором"""
    items: List[MessageResponse]
    has_more: bool = False


# ========== Reactions ==========

class ReactionCreate(BaseModel):
    """Создание/удаление реакции (toggle)"""
    emoji: str = Field(..., min_length=1, max_length=10)


# ========== Read Receipts ==========

class ReadReceiptRequest(BaseModel):
    """Отметить как прочитанное"""
    last_message_id: int


# ========== Members ==========

class MemberAddRequest(BaseModel):
    """Добавление участников"""
    user_ids: List[int] = Field(..., min_length=1)


class MemberRemoveRequest(BaseModel):
    """Удаление участника"""
    user_id: int


class MemberRoleUpdateRequest(BaseModel):
    """Изменение роли участника в чате"""
    role: str = Field(..., description="Новая роль: admin или member")


class OwnershipTransferRequest(BaseModel):
    """Передача ownership другому участнику"""
    user_id: int = Field(..., description="ID нового владельца")


# ========== Mute / Archive ==========

class MuteRequest(BaseModel):
    """Mute/unmute разговора"""
    is_muted: bool


class ArchiveRequest(BaseModel):
    """Archive/unarchive разговора"""
    is_archived: bool


# ========== Search ==========

class MessageSearchRequest(BaseModel):
    """Поиск по сообщениям"""
    query: str = Field(..., min_length=1, max_length=200)


# ========== Typing ==========

class TypingIndicator(BaseModel):
    """Индикатор печати (WS)"""
    conversation_id: int
    user_id: int
    is_typing: bool = True
