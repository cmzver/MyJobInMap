"""
Act Models
==========
Акты выполненных работ, прайс-лист организации и нумерация актов.

Акт неизменяем: после выпуска меняется только статус (подписан, аннулирован).
PDF рисуется из снимков content_snapshot/requisites_snapshot, поэтому правка
заявки, прайса или реквизитов не меняет уже выпущенный документ.
"""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow

if TYPE_CHECKING:
    from app.models.task import TaskModel
    from app.models.user import UserModel


class ServiceCatalogItemModel(Base):
    """Строка прайса организации: работа или материал с ценой по умолчанию."""

    __tablename__ = "service_catalog_items"
    __table_args__ = (
        Index("ix_service_catalog_org_active", "organization_id", "is_active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # work — работа/услуга, material — материал
    line_type: Mapped[str] = mapped_column(String(16), default="work", nullable=False)
    unit: Mapped[str] = mapped_column(String(20), default="усл", nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    system_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )


class ActModel(Base):
    """Акт выполненных работ по заявке."""

    __tablename__ = "acts"
    __table_args__ = (
        UniqueConstraint("organization_id", "number", name="uq_acts_org_number"),
        Index("ix_acts_org_created", "organization_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    # Документ переживает заявку: номер заявки и адрес — в снимке.
    task_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    number: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), default="task", nullable=False)
    # pending_signature — выпущен, ждёт подписи; signed; refused; cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    # Как подписан: paper — скан бумажного, screen — на телефоне мастера
    signed_via: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scan_file: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    customer_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # resident | chairman | uk_rep | other
    customer_role: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    customer_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    apartment: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    work_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    no_claims: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # cash | card | transfer | contract | none
    payment_method: Mapped[str] = mapped_column(
        String(16), default="none", nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, nullable=False
    )

    content_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    requisites_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    # SHA-256 канонического снимка — по нему проверяют подлинность распечатки.
    document_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    supersedes_act_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("acts.id", ondelete="SET NULL"), nullable=True
    )
    created_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=False
    )
    cancelled_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    lines: Mapped[List["ActLineModel"]] = relationship(
        "ActLineModel",
        back_populates="act",
        cascade="all, delete-orphan",
        order_by="ActLineModel.position",
    )
    task: Mapped[Optional["TaskModel"]] = relationship("TaskModel")
    created_by: Mapped[Optional["UserModel"]] = relationship(
        "UserModel", foreign_keys=[created_by_id]
    )


class ActLineModel(Base):
    """Строка акта: работа или материал."""

    __tablename__ = "act_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    act_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("acts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    line_type: Mapped[str] = mapped_column(String(16), nullable=False)
    catalog_item_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("service_catalog_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    act: Mapped["ActModel"] = relationship("ActModel", back_populates="lines")


class ActCounterModel(Base):
    """Счётчик номеров актов организации за год — номера без пропусков."""

    __tablename__ = "act_counters"

    organization_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
