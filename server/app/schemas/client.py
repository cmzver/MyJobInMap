"""Контракты кабинета клиента (представители контрагента) и управления входами."""

from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.datetime_utc import UtcDateTime

# ------------------------------------------------- управление входами (портал)

LOGIN_PATTERN = r"^[A-Za-z0-9._@-]+$"


class ClientAccountCreate(BaseModel):
    login: str = Field(min_length=3, max_length=100, pattern=LOGIN_PATTERN)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=200)
    position: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=200)


class ClientAccountUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    position: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = None
    # Новый пароль (сброс): выданные токены перестают действовать
    password: Optional[str] = Field(None, min_length=8, max_length=128)


class ClientAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    counterparty_id: int
    login: str
    full_name: str
    position: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool
    last_login_at: Optional[UtcDateTime] = None
    created_at: Optional[UtcDateTime] = None


# ---------------------------------------------------------------- кабинет


class ClientLogin(BaseModel):
    login: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class ClientMe(BaseModel):
    id: int
    login: str
    full_name: str
    position: Optional[str] = None
    counterparty_id: int
    counterparty_name: str
    organization_name: str
    organization_phone: Optional[str] = None


class ClientToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    account: ClientMe


class ClientPasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ClientSystem(BaseModel):
    id: int
    system_type: str
    name: str
    status: str
    contract_number: Optional[str] = None
    monthly_cost: Decimal = Decimal(0)


class ClientObject(BaseModel):
    id: int
    address: str
    systems: list[ClientSystem]
    open_tasks: int
    next_maintenance: Optional[date] = None


class ClientTaskItem(BaseModel):
    id: int
    number: str
    title: str
    address: str
    address_id: Optional[int] = None
    status: str
    status_label: str
    priority: str
    created_at: Optional[UtcDateTime] = None
    planned_date: Optional[UtcDateTime] = None
    completed_at: Optional[UtcDateTime] = None
    # Подана из кабинета — представителем контрагента
    from_cabinet: bool = False
    acts_count: int = 0


class ClientTaskPage(BaseModel):
    items: list[ClientTaskItem]
    total: int


class ClientTaskEvent(BaseModel):
    at: UtcDateTime
    text: str


class ClientAct(BaseModel):
    id: int
    number: str
    kind: str
    status: str
    total_amount: Decimal
    created_at: Optional[UtcDateTime] = None
    signed_at: Optional[UtcDateTime] = None
    task_id: Optional[int] = None
    task_number: Optional[str] = None
    period_start: Optional[date] = None
    customer_name: Optional[str] = None


class ClientTaskDetail(ClientTaskItem):
    description: str = ""
    executor: Optional[str] = None
    events: list[ClientTaskEvent]
    acts: list[ClientAct]


class ClientTaskCreate(BaseModel):
    address_id: int = Field(gt=0)
    title: str = Field(min_length=3, max_length=200)
    description: str = Field("", max_length=2000)
    apartment: Optional[str] = Field(None, max_length=20)
    contact_name: Optional[str] = Field(None, max_length=200)
    contact_phone: Optional[str] = Field(None, max_length=50)
    urgent: bool = False


class ClientMaintenance(BaseModel):
    plan_id: int
    title: str
    address: str
    address_id: int
    frequency: str
    interval: int
    next_date: Optional[date] = None
    last_done_at: Optional[UtcDateTime] = None


class ClientActPage(BaseModel):
    items: list[ClientAct]
    total: int


__all__ = [
    "ClientAccountCreate",
    "ClientAccountResponse",
    "ClientAccountUpdate",
    "ClientAct",
    "ClientActPage",
    "ClientLogin",
    "ClientMaintenance",
    "ClientMe",
    "ClientObject",
    "ClientPasswordChange",
    "ClientSystem",
    "ClientTaskCreate",
    "ClientTaskDetail",
    "ClientTaskEvent",
    "ClientTaskItem",
    "ClientTaskPage",
    "ClientToken",
]
