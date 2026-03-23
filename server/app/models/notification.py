"""Notification model."""

import enum

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import Base, utcnow


class NotificationType(str, enum.Enum):
    """Notification type values."""

    TASK = "task"
    SYSTEM = "system"
    ALERT = "alert"
    SUPPORT = "support"


class NotificationModel(Base):
    """Notification ORM model."""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    type = Column(String(20), default="system")  # task, system, alert, support
    is_read = Column(Boolean, default=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    support_ticket_id = Column(
        Integer, ForeignKey("support_tickets.id"), nullable=True, index=True
    )
    created_at = Column(DateTime, default=utcnow)

    user = relationship("UserModel", back_populates="notifications")
    task = relationship("TaskModel", back_populates="notifications")
    support_ticket = relationship("SupportTicketModel")

    def __repr__(self):
        return f"<Notification {self.id}: {self.title[:30]}...>"
