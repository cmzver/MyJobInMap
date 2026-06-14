"""
Chat Models
===========
Модели для чата: разговоры, участники, сообщения, вложения, реакции, упоминания.
"""

import enum
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow

if TYPE_CHECKING:
    from app.models.organization import OrganizationModel
    from app.models.task import TaskModel
    from app.models.user import UserModel


class ConversationType(str, enum.Enum):
    """Типы чатов"""

    TASK = "task"  # Чат по заявке
    DIRECT = "direct"  # Личные сообщения (1-на-1)
    GROUP = "group"  # Групповой чат
    ORG_GENERAL = "org_general"  # Общий чат организации


class ConversationMemberRole(str, enum.Enum):
    """Роли участника в чате"""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class MessageType(str, enum.Enum):
    """Типы сообщений"""

    TEXT = "text"
    IMAGE = "image"
    FILE = "file"
    SYSTEM = "system"  # Авто-события (участник добавлен, и т.д.)
    TASK = "task"  # Прикреплённая заявка (карточка с переходом)


class ConversationModel(Base):
    """Модель разговора (комнаты чата)"""

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("type", "task_id", name="uq_conversation_task"),
        Index("ix_conversations_org", "organization_id"),
        Index("ix_conversations_type", "type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # ConversationType
    name: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )  # Для group/org_general
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Привязка к заявке (только для type=task)
    task_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tasks.id"), nullable=True, unique=True
    )

    # Multi-tenant
    organization_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("organizations.id"), nullable=True
    )

    created_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=True
    )

    # Denormalized для быстрой сортировки списка чатов
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    task: Mapped[Optional["TaskModel"]] = relationship(
        "TaskModel", back_populates="conversation"
    )
    organization: Mapped[Optional["OrganizationModel"]] = relationship(
        "OrganizationModel", back_populates="conversations"
    )
    creator: Mapped["UserModel"] = relationship("UserModel", foreign_keys=[created_by])
    members: Mapped[List["ConversationMemberModel"]] = relationship(
        "ConversationMemberModel",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )
    messages: Mapped[List["MessageModel"]] = relationship(
        "MessageModel",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


class ConversationMemberModel(Base):
    """Участник разговора"""

    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conv_member"),
        Index("ix_conv_members_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conversation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(20), default=ConversationMemberRole.MEMBER.value, nullable=True
    )

    # Прочтение: ID последнего прочитанного сообщения
    last_read_message_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    is_muted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=True)

    # Relationships
    conversation: Mapped["ConversationModel"] = relationship(
        "ConversationModel", back_populates="members"
    )
    user: Mapped["UserModel"] = relationship("UserModel")


class MessageModel(Base):
    """Сообщение в чате"""

    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conv_created", "conversation_id", "created_at"),
        Index("ix_messages_sender", "sender_id"),
        Index("ix_messages_task", "task_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conversation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )

    text: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # Nullable если только вложение
    message_type: Mapped[str] = mapped_column(
        String(20), default=MessageType.TEXT.value, nullable=True
    )

    # Ответ на сообщение
    reply_to_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("messages.id"), nullable=True
    )

    # Прикреплённая заявка (для type=task). Превью собирается живым при сериализации.
    task_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tasks.id"), nullable=True
    )

    is_edited: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=True
    )  # Soft delete

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )

    # Relationships
    conversation: Mapped["ConversationModel"] = relationship(
        "ConversationModel", back_populates="messages"
    )
    sender: Mapped["UserModel"] = relationship("UserModel", foreign_keys=[sender_id])
    reply_to: Mapped[Optional["MessageModel"]] = relationship(
        "MessageModel", remote_side="MessageModel.id", uselist=False
    )
    # Одно-направленная ссылка на заявку (уникальную связь чат↔заявка держит
    # ConversationModel.task_id; здесь связь не уникальна и без back_populates).
    task: Mapped[Optional["TaskModel"]] = relationship(
        "TaskModel", foreign_keys=[task_id]
    )
    attachments: Mapped[List["MessageAttachmentModel"]] = relationship(
        "MessageAttachmentModel",
        back_populates="message",
        cascade="all, delete-orphan",
    )
    reactions: Mapped[List["MessageReactionModel"]] = relationship(
        "MessageReactionModel",
        back_populates="message",
        cascade="all, delete-orphan",
    )
    mentions: Mapped[List["MessageMentionModel"]] = relationship(
        "MessageMentionModel",
        back_populates="message",
        cascade="all, delete-orphan",
    )


class MessageAttachmentModel(Base):
    """Вложение к сообщению"""

    __tablename__ = "message_attachments"
    __table_args__ = (Index("ix_msg_attachments_message", "message_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )

    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0, nullable=True)  # bytes
    mime_type: Mapped[str] = mapped_column(
        String(100), default="application/octet-stream", nullable=True
    )
    thumbnail_path: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )  # Для изображений

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )

    # Relationships
    message: Mapped["MessageModel"] = relationship(
        "MessageModel", back_populates="attachments"
    )


class MessageReactionModel(Base):
    """Реакция на сообщение"""

    __tablename__ = "message_reactions"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", "emoji", name="uq_reaction"),
        Index("ix_reactions_message", "message_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    emoji: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )

    # Relationships
    message: Mapped["MessageModel"] = relationship(
        "MessageModel", back_populates="reactions"
    )
    user: Mapped["UserModel"] = relationship("UserModel")


class MessageMentionModel(Base):
    """@упоминание в сообщении"""

    __tablename__ = "message_mentions"
    __table_args__ = (
        Index("ix_mentions_message", "message_id"),
        Index("ix_mentions_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )  # Упомянутый пользователь
    offset: Mapped[int] = mapped_column(
        Integer, default=0, nullable=True
    )  # Позиция в тексте
    length: Mapped[int] = mapped_column(
        Integer, default=0, nullable=True
    )  # Длина упоминания в тексте

    # Relationships
    message: Mapped["MessageModel"] = relationship(
        "MessageModel", back_populates="mentions"
    )
    user: Mapped["UserModel"] = relationship("UserModel")
