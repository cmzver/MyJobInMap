"""
Task Models
===========
Модели заявок, комментариев и фотографий.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, Index
from sqlalchemy.orm import relationship

from app.models.base import Base, utcnow
from app.models.enums import TaskStatus, TaskPriority


class TaskModel(Base):
    """Модель заявки"""
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_priority_created", "priority", "created_at"),
        Index("ix_tasks_assigned_status", "assigned_user_id", "status"),
        Index("ix_tasks_planned_date", "planned_date"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    task_number = Column(String, nullable=True, index=True)  # Номер от диспетчера
    title = Column(String, nullable=False)
    raw_address = Column(String, nullable=False)
    description = Column(String, default="")
    customer_name = Column(String(200), nullable=True, index=True)
    customer_phone = Column(String(50), nullable=True, index=True)
    lat = Column(Float, default=0.0)
    lon = Column(Float, default=0.0)
    status = Column(String, default=TaskStatus.NEW.value)
    priority = Column(String, default=TaskPriority.PLANNED.value)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    planned_date = Column(DateTime, nullable=True)  # Планируемая дата выполнения
    completed_at = Column(DateTime, nullable=True)
    
    # Назначенный пользователь
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_user = relationship("UserModel", back_populates="assigned_tasks")
    
    # Система и тип неисправности
    system_id = Column(Integer, ForeignKey("address_systems.id"), nullable=True)
    system_type = Column(String(50), nullable=True)  # Тип системы (video_surveillance, intercom, etc.)
    defect_type = Column(String(200), nullable=True)  # Название типа неисправности
    
    # Финансовые поля
    is_remote = Column(Boolean, default=False)
    is_paid = Column(Boolean, default=False)
    payment_amount = Column(Float, default=0.0)
    
    # Связи
    comments = relationship("CommentModel", back_populates="task", cascade="all, delete-orphan")
    photos = relationship("TaskPhotoModel", back_populates="task", cascade="all, delete-orphan")
    notifications = relationship("NotificationModel", back_populates="task")


class CommentModel(Base):
    """Модель комментария/истории изменений"""
    __tablename__ = "comments"
    __table_args__ = (
        Index("ix_comments_task_id", "task_id"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    text = Column(Text, nullable=False)
    author = Column(String, default="Система")
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    old_status = Column(String, nullable=True)
    new_status = Column(String, nullable=True)
    old_assignee = Column(String, nullable=True)
    new_assignee = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    
    task = relationship("TaskModel", back_populates="comments")


class TaskPhotoModel(Base):
    """Модель фотографии заявки"""
    __tablename__ = "task_photos"
    __table_args__ = (
        Index("ix_task_photos_task_id", "task_id"),
        Index("ix_task_photos_filename", "filename"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=True)
    file_size = Column(Integer, default=0)
    mime_type = Column(String(50), default="image/jpeg")
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    photo_type = Column(String(20), default="completion")  # before/after/completion
    created_at = Column(DateTime, default=utcnow)
    
    task = relationship("TaskModel", back_populates="photos")
    uploaded_by = relationship("UserModel")
