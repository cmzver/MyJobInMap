"""
Organization Model
==================
Модель организации для multi-tenant поддержки.
"""

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow

if TYPE_CHECKING:
    from app.models.address import AddressModel
    from app.models.chat import ConversationModel
    from app.models.support import SupportTicketModel
    from app.models.task import TaskModel
    from app.models.user import UserModel


class OrganizationModel(Base):
    """Модель организации (tenant)"""

    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(
        String(200), nullable=False, unique=True, index=True
    )
    slug: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True, index=True
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Контактная информация
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Настройки
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=True)
    max_users: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    max_tasks: Mapped[int] = mapped_column(Integer, default=10000, nullable=False)

    # Метаданные
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=True
    )

    # Связи
    users: Mapped[List["UserModel"]] = relationship(
        "UserModel", back_populates="organization"
    )
    tasks: Mapped[List["TaskModel"]] = relationship(
        "TaskModel", back_populates="organization"
    )
    addresses: Mapped[List["AddressModel"]] = relationship(
        "AddressModel", back_populates="organization"
    )
    conversations: Mapped[List["ConversationModel"]] = relationship(
        "ConversationModel", back_populates="organization"
    )
    support_tickets: Mapped[List["SupportTicketModel"]] = relationship(
        "SupportTicketModel", back_populates="organization"
    )


class OrganizationSettingsModel(Base):
    """Реквизиты, документы и нормативы организации (1:1 к organizations).

    Строки может не быть — тогда действуют значения по умолчанию
    (см. organization_settings_service).
    """

    __tablename__ = "organization_settings"

    organization_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )

    # Реквизиты — для шапки актов
    legal_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    inn: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    kpp: Mapped[Optional[str]] = mapped_column(String(9), nullable=True)
    ogrn: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    legal_address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    bik: Mapped[Optional[str]] = mapped_column(String(9), nullable=True)
    account: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    corr_account: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    director_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    director_title: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Документы
    act_number_prefix: Mapped[str] = mapped_column(
        String(10), default="А", nullable=False
    )
    act_footer_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Нормативы срока по приоритету, часы: {"EMERGENCY": 4, ...}.
    # NULL — нормативы по умолчанию (sla_service.DEFAULT_SLA_HOURS).
    sla_hours: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Заявка на том же месте, закрытая не раньше стольких дней назад, — возврат.
    repeat_window_days: Mapped[int] = mapped_column(
        Integer, default=30, server_default="30", nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=True
    )
    updated_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
