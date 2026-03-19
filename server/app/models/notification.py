"""
Notification Model
==================
РњРѕРґРµР»СЊ СѓРІРµРґРѕРјР»РµРЅРёР№ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.
"""

import enum

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, utcnow


class NotificationType(str, enum.Enum):
    """РўРёРїС‹ СѓРІРµРґРѕРјР»РµРЅРёР№"""
    TASK = "task"       # РЈРІРµРґРѕРјР»РµРЅРёРµ Рѕ Р·Р°СЏРІРєРµ
    SYSTEM = "system"   # РЎРёСЃС‚РµРјРЅРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ
    ALERT = "alert"     # Р’Р°Р¶РЅРѕРµ РїСЂРµРґСѓРїСЂРµР¶РґРµРЅРёРµ


class NotificationModel(Base):
    """РњРѕРґРµР»СЊ СѓРІРµРґРѕРјР»РµРЅРёСЏ"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    type = Column(String(20), default="system")  # task, system, alert
    is_read = Column(Boolean, default=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    # Relations
    user = relationship("UserModel", back_populates="notifications")
    task = relationship("TaskModel", back_populates="notifications")

    def __repr__(self):
        return f"<Notification {self.id}: {self.title[:30]}...>"
