"""Схемы контрагентов (УК/ТСЖ) и сводного акта за месяц."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.datetime_utc import UtcDateTime

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


class CounterpartyFields(BaseModel):
    legal_name: Optional[str] = Field(None, max_length=300)
    inn: Optional[str] = Field(None, pattern=r"^(\d{10}|\d{12})$")
    kpp: Optional[str] = Field(None, pattern=r"^\d{9}$")
    ogrn: Optional[str] = Field(None, pattern=r"^(\d{13}|\d{15})$")
    legal_address: Optional[str] = Field(None, max_length=500)
    bank_name: Optional[str] = Field(None, max_length=200)
    bik: Optional[str] = Field(None, pattern=r"^\d{9}$")
    account: Optional[str] = Field(None, pattern=r"^\d{20}$")
    corr_account: Optional[str] = Field(None, pattern=r"^\d{20}$")
    contract_number: Optional[str] = Field(None, max_length=100)
    contract_date: Optional[str] = Field(None, max_length=20)
    signer_name: Optional[str] = Field(None, max_length=200)
    signer_position: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=2000)


class CounterpartyCreate(CounterpartyFields):
    name: str = Field(..., min_length=1, max_length=200)


class CounterpartyUpdate(CounterpartyFields):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    is_active: Optional[bool] = None


class CounterpartyResponse(CounterpartyFields):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool
    # Сколько объектов привязано и их абонплата в месяц — для списка
    address_count: int = 0
    monthly_total: float = 0
    created_at: UtcDateTime


class CounterpartyAddress(BaseModel):
    id: int
    address: str
    monthly_cost: float = 0


class CounterpartyAddressesUpdate(BaseModel):
    """Полный список объектов контрагента: отсутствующие отвязываются."""

    address_ids: List[int] = Field(default_factory=list, max_length=2000)


class SummaryLine(BaseModel):
    position: int
    kind: str  # subscription | act
    name: str
    details: Optional[str] = None
    amount: float


class SummaryVisit(BaseModel):
    date: str
    task_id: int
    task_number: str
    address: str
    title: str
    worker: Optional[str] = None
    remote: bool = False


class SummaryPreview(BaseModel):
    """Сводный акт до выпуска: что попадёт в документ за месяц."""

    month: str
    period_label: str
    lines: List[SummaryLine]
    visits: List[SummaryVisit]
    subscription_total: float
    acts_total: float
    total: float
    # Уже выпущенный (не аннулированный) сводный акт за этот месяц
    existing_act_id: Optional[int] = None
    existing_act_number: Optional[str] = None


class SummaryActCreate(BaseModel):
    month: str = Field(..., pattern=MONTH_PATTERN)
    # Исправленная версия: прежний сводный акт за месяц аннулируется
    supersedes_act_id: Optional[int] = None
