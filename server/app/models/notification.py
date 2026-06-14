"""Notification model."""

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow

if TYPE_CHECKING:
    from app.models.support import SupportTicketModel
    from app.models.task import TaskModel
    from app.models.user import UserModel


class NotificationType(str, enum.Enum):
    """Notification type values."""

    TASK = "task"
    SYSTEM = "system"
    ALERT = "alert"
    SUPPORT = "support"


class NotificationModel(Base):
    """Notification ORM model."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_task_read", "user_id", "task_id", "is_read"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    type: Mapped[str] = mapped_column(
        String(20), default="system", nullable=True
    )  # task, system, alert, support
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    task_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tasks.id"), nullable=True
    )
    support_ticket_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("support_tickets.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )

    user: Mapped["UserModel"] = relationship(
        "UserModel", back_populates="notifications"
    )
    task: Mapped[Optional["TaskModel"]] = relationship(
        "TaskModel", back_populates="notifications"
    )
    support_ticket: Mapped[Optional["SupportTicketModel"]] = relationship(
        "SupportTicketModel"
    )

    def __repr__(self):
        return f"<Notification {self.id}: {self.title[:30]}...>"
