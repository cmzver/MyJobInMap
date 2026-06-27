"""
User Models
===========
Модели пользователей и устройств.
"""

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow
from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.notification import NotificationModel
    from app.models.organization import OrganizationModel
    from app.models.support import SupportTicketCommentModel, SupportTicketModel
    from app.models.task import TaskModel


class UserModel(Base):
    """Модель пользователя"""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), default="", nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    avatar_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(
        String(20), default=UserRole.WORKER.value, nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Multi-tenant
    organization_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("organizations.id"), nullable=True, index=True
    )

    # Настройки отправки отчётов: 'group', 'contact', 'none'
    report_target: Mapped[str] = mapped_column(
        String(20), default="group", nullable=True
    )
    # Номер телефона для отправки отчётов (если report_target='contact')
    report_contact_phone: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )

    # FCM токены устройств пользователя
    devices: Mapped[List["DeviceModel"]] = relationship(
        "DeviceModel", back_populates="user", cascade="all, delete-orphan"
    )

    # Назначенные задачи
    assigned_tasks: Mapped[List["TaskModel"]] = relationship(
        "TaskModel", back_populates="assigned_user"
    )

    # Уведомления пользователя
    notifications: Mapped[List["NotificationModel"]] = relationship(
        "NotificationModel", back_populates="user", cascade="all, delete-orphan"
    )
    support_tickets_created: Mapped[List["SupportTicketModel"]] = relationship(
        "SupportTicketModel",
        back_populates="created_by",
        foreign_keys="SupportTicketModel.created_by_id",
        cascade="all, delete-orphan",
    )
    support_comments_authored: Mapped[List["SupportTicketCommentModel"]] = relationship(
        "SupportTicketCommentModel",
        back_populates="author",
        foreign_keys="SupportTicketCommentModel.author_id",
        cascade="all, delete-orphan",
    )

    # Организация
    organization: Mapped[Optional["OrganizationModel"]] = relationship(
        "OrganizationModel", back_populates="users"
    )


class DeviceModel(Base):
    """Модель устройства (FCM токен)"""

    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    fcm_token: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    device_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    last_active: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )

    user: Mapped["UserModel"] = relationship("UserModel", back_populates="devices")


class PushSubscriptionModel(Base):
    """Web Push подписка браузера (Push API / VAPID).

    Отдельно от ``DeviceModel`` (FCM/Android): здесь — браузерные подписки
    портала. ``endpoint`` уникален; ``p256dh``/``auth`` — ключи шифрования
    полезной нагрузки, выданные браузером при подписке.
    """

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )

    user: Mapped["UserModel"] = relationship("UserModel")
