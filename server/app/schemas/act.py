"""Схемы актов выполненных работ и прайс-листа."""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.schemas.datetime_utc import UtcDateTime

LineType = Literal["work", "material"]
CustomerRole = Literal["resident", "chairman", "uk_rep", "other"]
PaymentMethod = Literal["cash", "card", "transfer", "contract", "none"]
ActStatus = Literal["pending_signature", "signed", "refused", "cancelled"]

MAX_PRICE = 10_000_000


# ---------------------------------------------------------------- прайс-лист


class CatalogItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    line_type: LineType = "work"
    unit: str = Field("усл", min_length=1, max_length=20)
    price: float = Field(0, ge=0, le=MAX_PRICE)
    system_type: Optional[str] = Field(None, max_length=50)
    is_active: bool = True
    sort_order: int = 0


class CatalogItemCreate(CatalogItemBase):
    pass


class CatalogItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    line_type: Optional[LineType] = None
    unit: Optional[str] = Field(None, min_length=1, max_length=20)
    price: Optional[float] = Field(None, ge=0, le=MAX_PRICE)
    system_type: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class CatalogItemResponse(CatalogItemBase):
    id: int


# ---------------------------------------------------------------------- акты


class ActLineInput(BaseModel):
    """Строка акта: из прайса (catalog_item_id) или свободная (name обязателен).

    Цену можно не передавать — возьмётся из прайса; сумму считает сервер."""

    catalog_item_id: Optional[int] = None
    line_type: Optional[LineType] = None
    name: Optional[str] = Field(None, max_length=200)
    unit: Optional[str] = Field(None, max_length=20)
    qty: float = Field(1, gt=0, le=100_000)
    price: Optional[float] = Field(None, ge=0, le=MAX_PRICE)
    serial_number: Optional[str] = Field(None, max_length=100)

    @model_validator(mode="after")
    def _catalog_or_name(self):
        if self.catalog_item_id is None and not (self.name or "").strip():
            raise ValueError(
                "Строка акта: выберите позицию прайса или укажите название"
            )
        return self


class ActCreate(BaseModel):
    lines: List[ActLineInput] = Field(default_factory=list, max_length=100)
    customer_name: Optional[str] = Field(None, max_length=200)
    customer_role: CustomerRole = "resident"
    customer_phone: Optional[str] = Field(None, max_length=50)
    apartment: Optional[str] = Field(None, max_length=20)
    work_summary: Optional[str] = Field(None, max_length=4000)
    customer_remarks: Optional[str] = Field(None, max_length=2000)
    no_claims: bool = True
    payment_method: PaymentMethod = "none"
    # Исправленная версия: прежний акт той же заявки аннулируется.
    supersedes_act_id: Optional[int] = None

    @model_validator(mode="after")
    def _has_content(self):
        if not self.lines and not (self.work_summary or "").strip():
            raise ValueError(
                "Акт пустой: добавьте строки или опишите выполненные работы"
            )
        return self


class ActLineResponse(BaseModel):
    id: int
    position: int
    line_type: LineType
    catalog_item_id: Optional[int] = None
    name: str
    unit: str
    qty: float
    price: float
    amount: float
    serial_number: Optional[str] = None


class ActResponse(BaseModel):
    id: int
    number: str
    task_id: Optional[int] = None
    task_number: Optional[str] = None
    address: Optional[str] = None
    status: ActStatus
    signed_via: Optional[str] = None
    signed_at: Optional[UtcDateTime] = None
    has_scan: bool = False
    customer_name: Optional[str] = None
    customer_role: Optional[CustomerRole] = None
    customer_phone: Optional[str] = None
    apartment: Optional[str] = None
    work_summary: Optional[str] = None
    customer_remarks: Optional[str] = None
    no_claims: bool = True
    payment_method: PaymentMethod
    total_amount: float
    document_hash: str
    supersedes_act_id: Optional[int] = None
    created_at: UtcDateTime
    created_by_name: Optional[str] = None
    cancelled_at: Optional[UtcDateTime] = None
    cancel_reason: Optional[str] = None
    lines: List[ActLineResponse] = Field(default_factory=list)


class ActListResponse(BaseModel):
    items: List[ActResponse]
    total: int
    page: int
    size: int


class ActCancelRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
