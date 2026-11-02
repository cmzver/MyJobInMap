"""Контракты плановых работ и учёта материалов."""

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.address import AddressEquipmentResponse
from app.schemas.task import TaskListResponse


class MaintenanceFields(BaseModel):
    """Регламент без привязки к объекту — общая часть одиночного и массового."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=2000)
    assigned_user_id: int | None = None
    priority: Literal["PLANNED", "CURRENT", "URGENT", "EMERGENCY"] = "PLANNED"
    frequency: Literal["daily", "weekly", "monthly"] = "monthly"
    interval: int = Field(1, ge=1, le=365)
    start_date: date
    end_date: date | None = None
    excluded_dates: list[date] = Field(default_factory=list, max_length=366)
    enabled: bool = True

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("Конец периода раньше начала")
        if not self.title.strip():
            raise ValueError("Укажите название")
        self.title = self.title.strip()
        return self


class MaintenanceCreate(MaintenanceFields):
    address_id: int = Field(gt=0)
    equipment_id: int | None = None


class MaintenanceBulkCreate(MaintenanceFields):
    """Один регламент на много объектов: явный список или все объекты УК."""

    address_ids: list[int] = Field(default_factory=list, max_length=500)
    counterparty_id: int | None = None

    @model_validator(mode="after")
    def one_target(self):
        if bool(self.address_ids) == (self.counterparty_id is not None):
            raise ValueError("Выберите объекты или контрагента")
        return self


class MaintenanceBulkResult(BaseModel):
    created: int
    # Объекты, где регламент с таким названием уже есть, — пропущены
    skipped: list[str]


class ScheduleCell(BaseModel):
    month: str
    done: int = 0
    open: int = 0
    overdue: int = 0
    planned: int = 0
    cancelled: int = 0


class ScheduleRow(BaseModel):
    plan_id: int
    title: str
    address_id: int
    address: str
    counterparty_id: int | None = None
    counterparty_name: str | None = None
    assigned_user_name: str | None = None
    frequency: str
    interval: int
    next_date: date
    enabled: bool
    cells: list[ScheduleCell]


class ScheduleResponse(BaseModel):
    """Сетка «регламент × месяц»: факт по созданным заявкам, впереди — прогноз."""

    months: list[str]
    rows: list[ScheduleRow]
    totals: list[ScheduleCell]


class MaintenanceResponse(MaintenanceCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    next_date: date


class RouteUpdate(BaseModel):
    task_ids: list[int] = Field(max_length=500)

    @model_validator(mode="after")
    def unique_tasks(self):
        if len(set(self.task_ids)) != len(self.task_ids):
            raise ValueError("Заявка повторяется в маршруте")
        return self


class DayResponse(BaseModel):
    day: date
    user_id: int
    tasks: list[TaskListResponse]


class RouteResponse(BaseModel):
    task_ids: list[int]


class EquipmentPassportResponse(BaseModel):
    equipment: AddressEquipmentResponse
    address: str
    address_id: int
    tasks: list[TaskListResponse]


class StockResponse(BaseModel):
    material_id: int
    name: str
    unit: str
    quantity: Decimal
    user_id: int


class MaterialCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    unit: str = Field("шт.", min_length=1, max_length=20)
    unit_cost: Decimal = Field(Decimal("0"), ge=0, max_digits=14, decimal_places=2)


class MaterialResponse(MaterialCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    active: bool


class MaterialMovementCreate(BaseModel):
    material_id: int = Field(gt=0)
    user_id: int | None = None
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    reason: str = Field("", max_length=500)
    operation_id: str = Field(min_length=1, max_length=64)


class MaterialAdjustment(MaterialMovementCreate):
    kind: Literal["receipt", "write_off"] = "receipt"


class MaterialMovementResponse(BaseModel):
    id: int
    material_id: int
    material_name: str
    user_id: int | None
    task_id: int | None
    quantity: Decimal
    unit: str
    unit_cost: Decimal
    total_cost: Decimal
    reason: str
    created_at: str
