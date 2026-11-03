"""Плановое обслуживание, порядок выездов и учёт материалов."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class MaintenancePlanModel(Base):
    __tablename__ = "maintenance_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    address_id: Mapped[int] = mapped_column(
        ForeignKey("addresses.id", ondelete="CASCADE"), index=True
    )
    equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("address_equipment.id", ondelete="SET NULL")
    )
    assigned_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(4000), default="")
    priority: Mapped[str] = mapped_column(String(20), default="PLANNED")
    frequency: Mapped[str] = mapped_column(String(10))
    interval: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[date] = mapped_column(Date)
    next_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date | None] = mapped_column(Date)
    excluded_dates: Mapped[list] = mapped_column(JSON, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class MaintenanceOccurrenceModel(Base):
    __tablename__ = "maintenance_occurrences"
    __table_args__ = (
        UniqueConstraint("plan_id", "scheduled_date", name="uq_maintenance_occurrence"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("maintenance_plans.id", ondelete="CASCADE")
    )
    scheduled_date: Mapped[date] = mapped_column(Date)
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL")
    )


class DayRouteModel(Base):
    __tablename__ = "day_routes"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_day_route"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    task_ids: Mapped[list] = mapped_column(JSON, default=list)


class MaterialModel(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(20), default="шт.")
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Остаток на складе организации — кэш суммы проводок с пустым user_id.
    warehouse_quantity: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), default=0, server_default="0"
    )
    # Ниже этого остатка на складе материал подсвечивается «пора закупать».
    min_quantity: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))


class MaterialStockModel(Base):
    __tablename__ = "material_stocks"
    __table_args__ = (
        UniqueConstraint("material_id", "user_id", name="uq_material_stock"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("materials.id", ondelete="CASCADE")
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)


class MaterialMovementModel(Base):
    """Проводка по одному держателю: user_id пустой — склад организации.

    kind: receipt (приход), issue (склад → исполнитель), return (исполнитель →
    склад), write_off (списание, на заявку или вне её), act (досписание по акту),
    act_cancel (возврат при аннулировании акта), adjust (инвентаризация).
    Передача между держателями — две проводки одного вида с общим основанием."""

    __tablename__ = "material_movements"
    __table_args__ = (
        UniqueConstraint("created_by_id", "operation_id", name="uq_material_operation"),
        Index("ix_material_movements_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("materials.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    reason: Mapped[str] = mapped_column(String(500), default="")
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    operation_id: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(
        String(16), default="receipt", server_default="receipt"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
