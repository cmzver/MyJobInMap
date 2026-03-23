"""
Chat Models
===========
Модели для чата: разговоры, участники, сообщения, вложения, реакции, упоминания.
"""

import enum

from sqlalchemy import (Boolean, Column, DateTime, ForeignKey, Index, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import relationship

from app.models.base import Base, utcnow


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


class ConversationModel(Base):
    """Модель разговора (комнаты чата)"""

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("type", "task_id", name="uq_conversation_task"),
        Index("ix_conversations_org", "organization_id"),
        Index("ix_conversations_type", "type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(20), nullable=False)  # ConversationType
    name = Column(String(200), nullable=True)  # Для group/org_general
    avatar_url = Column(String(500), nullable=True)

    # Привязка к заявке (только для type=task)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, unique=True)

    # Multi-tenant
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Denormalized для быстрой сортировки списка чатов
    last_message_at = Column(DateTime, nullable=True)

    # Relationships
    task = relationship("TaskModel", back_populates="conversation")
    organization = relationship("OrganizationModel", back_populates="conversations")
    creator = relationship("UserModel", foreign_keys=[created_by])
    members = relationship(
        "ConversationMemberModel",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )
    messages = relationship(
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

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), default=ConversationMemberRole.MEMBER.value)

    # Прочтение: ID последнего прочитанного сообщения
    last_read_message_id = Column(Integer, nullable=True)

    is_muted = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=utcnow)

    # Relationships
    conversation = relationship("ConversationModel", back_populates="members")
    user = relationship("UserModel")


class MessageModel(Base):
    """Сообщение в чате"""

    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conv_created", "conversation_id", "created_at"),
        Index("ix_messages_sender", "sender_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    text = Column(Text, nullable=True)  # Nullable если только вложение
    message_type = Column(String(20), default=MessageType.TEXT.value)

    # Ответ на сообщение
    reply_to_id = Column(Integer, ForeignKey("messages.id"), nullable=True)

    is_edited = Column(Boolean, default=False)
    edited_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False)  # Soft delete

    created_at = Column(DateTime, default=utcnow)

    # Relationships
    conversation = relationship("ConversationModel", back_populates="messages")
    sender = relationship("UserModel", foreign_keys=[sender_id])
    reply_to = relationship(
        "MessageModel", remote_side="MessageModel.id", uselist=False
    )
    attachments = relationship(
        "MessageAttachmentModel",
        back_populates="message",
        cascade="all, delete-orphan",
    )
    reactions = relationship(
        "MessageReactionModel",
        back_populates="message",
        cascade="all, delete-orphan",
    )
    mentions = relationship(
        "MessageMentionModel",
        back_populates="message",
        cascade="all, delete-orphan",
    )


class MessageAttachmentModel(Base):
    """Вложение к сообщению"""

    __tablename__ = "message_attachments"
    __table_args__ = (Index("ix_msg_attachments_message", "message_id"),)

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )

    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, default=0)  # bytes
    mime_type = Column(String(100), default="application/octet-stream")
    thumbnail_path = Column(String(500), nullable=True)  # Для изображений

    created_at = Column(DateTime, default=utcnow)

    # Relationships
    message = relationship("MessageModel", back_populates="attachments")


class MessageReactionModel(Base):
    """Реакция на сообщение"""

    __tablename__ = "message_reactions"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", "emoji", name="uq_reaction"),
        Index("ix_reactions_message", "message_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    emoji = Column(String(10), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    message = relationship("MessageModel", back_populates="reactions")
    user = relationship("UserModel")


class MessageMentionModel(Base):
    """@упоминание в сообщении"""

    __tablename__ = "message_mentions"
    __table_args__ = (
        Index("ix_mentions_message", "message_id"),
        Index("ix_mentions_user", "user_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(
        Integer, ForeignKey("users.id"), nullable=False
    )  # Упомянутый пользователь
    offset = Column(Integer, default=0)  # Позиция в тексте
    length = Column(Integer, default=0)  # Длина упоминания в тексте

    # Relationships
    message = relationship("MessageModel", back_populates="mentions")
    user = relationship("UserModel")
