"""
Task Models
===========
Модели заявок, комментариев и фотографий.
"""

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow
from app.models.enums import TaskPriority, TaskStatus

if TYPE_CHECKING:
    from app.models.chat import ConversationModel
    from app.models.notification import NotificationModel
    from app.models.organization import OrganizationModel
    from app.models.user import UserModel


class TaskModel(Base):
    """Модель заявки"""

    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_priority_created", "priority", "created_at"),
        Index("ix_tasks_assigned_status", "assigned_user_id", "status"),
        Index("ix_tasks_planned_date", "planned_date"),
        Index("ix_tasks_created_at", "created_at"),
        Index("ix_tasks_completed_at", "completed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, index=True
    )  # Номер от диспетчера
    title: Mapped[str] = mapped_column(String, nullable=False)
    raw_address: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="", nullable=True)
    customer_name: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True, index=True
    )
    customer_phone: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, index=True
    )
    lat: Mapped[float] = mapped_column(Float, default=0.0, nullable=True)
    lon: Mapped[float] = mapped_column(Float, default=0.0, nullable=True)
    status: Mapped[str] = mapped_column(
        String, default=TaskStatus.NEW.value, nullable=True
    )
    priority: Mapped[str] = mapped_column(
        String, default=TaskPriority.PLANNED.value, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=True
    )
    planned_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )  # Планируемая дата выполнения
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Назначенный пользователь
    assigned_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    assigned_user: Mapped[Optional["UserModel"]] = relationship(
        "UserModel", back_populates="assigned_tasks"
    )

    # Multi-tenant
    organization_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("organizations.id"), nullable=True, index=True
    )

    # Система и тип неисправности
    system_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("address_systems.id"), nullable=True
    )
    system_type: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )  # Тип системы (video_surveillance, intercom, etc.)
    defect_type: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )  # Название типа неисправности

    # Финансовые поля
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    payment_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=True)

    # Связи
    comments: Mapped[List["CommentModel"]] = relationship(
        "CommentModel", back_populates="task", cascade="all, delete-orphan"
    )
    photos: Mapped[List["TaskPhotoModel"]] = relationship(
        "TaskPhotoModel", back_populates="task", cascade="all, delete-orphan"
    )
    notifications: Mapped[List["NotificationModel"]] = relationship(
        "NotificationModel", back_populates="task"
    )
    organization: Mapped[Optional["OrganizationModel"]] = relationship(
        "OrganizationModel", back_populates="tasks"
    )
    conversation: Mapped[Optional["ConversationModel"]] = relationship(
        "ConversationModel", back_populates="task", uselist=False
    )


class CommentModel(Base):
    """Модель комментария/истории изменений"""

    __tablename__ = "comments"
    __table_args__ = (Index("ix_comments_task_id", "task_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    author: Mapped[str] = mapped_column(String, default="Система", nullable=True)
    author_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    old_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    new_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    old_assignee: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    new_assignee: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )

    task: Mapped["TaskModel"] = relationship("TaskModel", back_populates="comments")


class TaskPhotoModel(Base):
    """Модель фотографии заявки"""

    __tablename__ = "task_photos"
    __table_args__ = (
        Index("ix_task_photos_task_id", "task_id"),
        Index("ix_task_photos_filename", "filename"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    mime_type: Mapped[str] = mapped_column(
        String(50), default="image/jpeg", nullable=True
    )
    uploaded_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    photo_type: Mapped[str] = mapped_column(
        String(20), default="completion", nullable=True
    )  # before/after/completion
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )

    task: Mapped["TaskModel"] = relationship("TaskModel", back_populates="photos")
    uploaded_by: Mapped[Optional["UserModel"]] = relationship("UserModel")
