"""
Organization Model
==================
Модель организации для multi-tenant поддержки.
"""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base, utcnow


class OrganizationModel(Base):
    """Модель организации (tenant)"""

    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True, index=True)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)

    # Контактная информация
    email = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(String(500), nullable=True)

    # Настройки
    is_active = Column(Boolean, default=True)
    max_users = Column(Integer, default=50, nullable=False)
    max_tasks = Column(Integer, default=10000, nullable=False)

    # Метаданные
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Связи
    users = relationship("UserModel", back_populates="organization")
    tasks = relationship("TaskModel", back_populates="organization")
    addresses = relationship("AddressModel", back_populates="organization")
    conversations = relationship("ConversationModel", back_populates="organization")
    support_tickets = relationship("SupportTicketModel", back_populates="organization")
