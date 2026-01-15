"""
User Models
===========
Модели пользователей и устройств.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, utcnow
from app.models.enums import UserRole


class UserModel(Base):
    """Модель пользователя"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), default="")
    email = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    role = Column(String(20), default=UserRole.WORKER.value)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    last_login = Column(DateTime, nullable=True)
    
    # Настройки отправки отчётов: 'group', 'contact', 'none'
    report_target = Column(String(20), default='group')
    # Номер телефона для отправки отчётов (если report_target='contact')
    report_contact_phone = Column(String(20), nullable=True)
    
    # FCM токены устройств пользователя
    devices = relationship("DeviceModel", back_populates="user", cascade="all, delete-orphan")
    
    # Назначенные задачи
    assigned_tasks = relationship("TaskModel", back_populates="assigned_user")
    
    # Уведомления пользователя
    notifications = relationship("NotificationModel", back_populates="user", cascade="all, delete-orphan")


class DeviceModel(Base):
    """Модель устройства (FCM токен)"""
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    fcm_token = Column(String(500), unique=True, nullable=False)
    device_name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    last_active = Column(DateTime, default=utcnow)
    
    user = relationship("UserModel", back_populates="devices")
