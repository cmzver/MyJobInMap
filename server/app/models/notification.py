"""
Notification Model
==================
Модель уведомлений пользователей.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base


class NotificationType(str, enum.Enum):
    """Типы уведомлений"""
    TASK = "task"       # Уведомление о заявке
    SYSTEM = "system"   # Системное уведомление
    ALERT = "alert"     # Важное предупреждение


class NotificationModel(Base):
    """Модель уведомления"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    type = Column(String(20), default="system")  # task, system, alert
    is_read = Column(Boolean, default=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relations
    user = relationship("UserModel", back_populates="notifications")
    task = relationship("TaskModel", back_populates="notifications")

    def __repr__(self):
        return f"<Notification {self.id}: {self.title[:30]}...>"
