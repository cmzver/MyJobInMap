"""
Task Schemas
============
Схемы для заявок.
"""

from datetime import datetime
from typing import Optional, List, Generic, TypeVar
from pydantic import BaseModel, Field, field_validator, ConfigDict

from app.models.enums import TaskStatus
from app.schemas.comment import CommentResponse


def _parse_planned_date_value(value):
    """Parse date/datetime string to datetime or return None."""
    if value is None or value == "":
        return None
    if isinstance(value, str):
        try:
            if len(value) == 10:
                return datetime.strptime(value, "%Y-%m-%d")
            if value.endswith("Z"):
                value = value.replace("Z", "+00:00")
            return datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("planned_date must be ISO date or datetime") from exc
    return value


class TaskCreate(BaseModel):
    """Создание заявки
    
    Все параметры кроме title и address опциональны.
    planned_date поддерживает форматы: YYYY-MM-DD или ISO datetime.
    """
    title: str = Field(..., min_length=1, max_length=200, json_schema_extra={"example": "Аварийная утечка"})
    address: str = Field(..., min_length=1, max_length=500, json_schema_extra={"example": "СПб, Невский пр., 1"})
    description: str = Field(default="", max_length=2000, json_schema_extra={"example": "Требуется срочный выезд"})
    customer_name: Optional[str] = Field(None, max_length=200, description="Имя клиента", json_schema_extra={"example": "Иван Иванов"})
    customer_phone: Optional[str] = Field(None, max_length=50, description="Телефон клиента", json_schema_extra={"example": "+79991234567"})
    status: Optional[str] = Field(None, description="NEW, IN_PROGRESS, DONE, CANCELLED", json_schema_extra={"example": "NEW"})
    priority: Optional[int] = Field(None, ge=1, le=4, description="1=Плановая, 2=Текущая, 3=Срочная, 4=Аварийная", json_schema_extra={"example": 4})
    assigned_user_id: Optional[int] = Field(None, description="ID исполнителя (worker)", json_schema_extra={"example": 1})
    planned_date: Optional[datetime] = Field(None, description="Плановая дата (YYYY-MM-DD или ISO datetime)", json_schema_extra={"example": "2025-12-31"})
    is_remote: Optional[bool] = Field(None, description="Удалённая ли заявка", json_schema_extra={"example": False})
    is_paid: Optional[bool] = Field(None, description="Платная ли заявка", json_schema_extra={"example": True})
    payment_amount: Optional[float] = Field(None, ge=0, description="Сумма оплаты (если is_paid=true)", json_schema_extra={"example": 2500.0})
    # Система и тип неисправности
    system_id: Optional[int] = Field(None, description="ID системы обслуживания", json_schema_extra={"example": 1})
    system_type: Optional[str] = Field(None, max_length=50, description="Тип системы (video_surveillance, intercom, etc.)", json_schema_extra={"example": "video_surveillance"})
    defect_type: Optional[str] = Field(None, max_length=200, description="Тип неисправности", json_schema_extra={"example": "Нет изображения"})

    @field_validator("planned_date", mode="before")
    @classmethod
    def _parse_planned_date(cls, value):
        """Allow plain date (YYYY-MM-DD) or full ISO datetime; empty -> None."""
        return _parse_planned_date_value(value)


class TaskUpdate(BaseModel):
    """Обновление заявки (админ)
    
    Все поля опциональны. Передавай только то, что хочешь изменить.
    planned_date поддерживает YYYY-MM-DD или ISO datetime. Пусто/null → без изменений.
    """
    title: Optional[str] = Field(None, min_length=1, max_length=200, json_schema_extra={"example": "Новый заголовок"})
    address: Optional[str] = Field(None, min_length=1, max_length=500, json_schema_extra={"example": "Новый адрес"})
    description: Optional[str] = Field(None, max_length=2000, json_schema_extra={"example": "Новое описание"})
    customer_name: Optional[str] = Field(None, max_length=200, json_schema_extra={"example": "Иван Иванов"})
    customer_phone: Optional[str] = Field(None, max_length=50, json_schema_extra={"example": "+79991234567"})
    status: Optional[str] = Field(None, description="NEW, IN_PROGRESS, DONE, CANCELLED", json_schema_extra={"example": "IN_PROGRESS"})
    priority: Optional[int] = Field(None, ge=1, le=4, json_schema_extra={"example": 3})
    assigned_user_id: Optional[int] = Field(None, description="ID нового исполнителя", json_schema_extra={"example": 2})
    planned_date: Optional[datetime] = Field(None, description="Новая плановая дата", json_schema_extra={"example": "2025-12-25"})
    is_remote: Optional[bool] = Field(None, json_schema_extra={"example": True})
    is_paid: Optional[bool] = Field(None, json_schema_extra={"example": False})
    payment_amount: Optional[float] = Field(None, ge=0, json_schema_extra={"example": 0.0})
    # Система и тип неисправности
    system_id: Optional[int] = Field(None, description="ID системы обслуживания", json_schema_extra={"example": 1})
    system_type: Optional[str] = Field(None, max_length=50, description="Тип системы", json_schema_extra={"example": "video_surveillance"})
    defect_type: Optional[str] = Field(None, max_length=200, description="Тип неисправности", json_schema_extra={"example": "Нет изображения"})

    @field_validator("planned_date", mode="before")
    @classmethod
    def _parse_planned_date(cls, value):
        """Allow plain date (YYYY-MM-DD) or full ISO datetime; empty -> None."""
        return _parse_planned_date_value(value)


class TaskStatusUpdate(BaseModel):
    """Обновление статуса"""
    status: TaskStatus
    comment: str = Field(default="", max_length=1000)


class TaskAssignRequest(BaseModel):
    """Task assignment payload."""
    assigned_user_id: Optional[int] = Field(None, json_schema_extra={"example": 2})


class PlannedDateUpdate(BaseModel):
    """Planned date update payload."""
    planned_date: Optional[datetime] = Field(None, json_schema_extra={"example": "2025-12-31"})

    @field_validator("planned_date", mode="before")
    @classmethod
    def _parse_planned_date(cls, value):
        """Allow plain date (YYYY-MM-DD) or full ISO datetime; empty -> None."""
        return _parse_planned_date_value(value)


class TaskResponse(BaseModel):
    """Полный ответ заявки
    
    Включает все данные заявки, включая геолокацию, плановую дату, платёжные данные и комментарии.
    """
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    task_number: Optional[str] = Field(None, description="Номер заявки (автогенерируется)", json_schema_extra={"example": "FW-0001"})
    title: str = Field(..., json_schema_extra={"example": "Ремонт стояка"})
    raw_address: str = Field(..., json_schema_extra={"example": "СПб, Лиговский пр., 50"})
    description: str = Field(..., json_schema_extra={"example": "Затопление подъезда"})
    customer_name: Optional[str] = Field(None, description="Имя клиента", json_schema_extra={"example": "Иван Иванов"})
    customer_phone: Optional[str] = Field(None, description="Телефон клиента", json_schema_extra={"example": "+79991234567"})
    lat: float = Field(..., description="Широта (геокодирование)", json_schema_extra={"example": 59.920})
    lon: float = Field(..., description="Долгота (геокодирование)", json_schema_extra={"example": 30.355})
    status: str = Field(..., description="NEW, IN_PROGRESS, DONE, CANCELLED", json_schema_extra={"example": "IN_PROGRESS"})
    priority: int = Field(..., description="1-4: Плановая, Текущая, Срочная, Аварийная", json_schema_extra={"example": 3})
    created_at: datetime = Field(..., description="Дата создания (UTC)", json_schema_extra={"example": "2025-12-09T23:00:00"})
    updated_at: datetime = Field(..., description="Дата последнего обновления (UTC)", json_schema_extra={"example": "2025-12-09T23:30:00"})
    planned_date: Optional[datetime] = Field(None, description="Плановая дата выполнения", json_schema_extra={"example": "2025-12-10T00:00:00"})
    completed_at: Optional[datetime] = Field(None, description="Дата завершения (если статус=DONE)", json_schema_extra={"example": "2025-12-09T21:00:00"})
    assigned_user_id: Optional[int] = Field(None, description="ID назначенного исполнителя", json_schema_extra={"example": 2})
    assigned_user_name: Optional[str] = Field(None, description="Имя исполнителя", json_schema_extra={"example": "Иван Полевой"})
    is_remote: bool = Field(False, description="Может ли быть выполнена удалённо", json_schema_extra={"example": False})
    is_paid: bool = Field(False, description="Платная ли заявка", json_schema_extra={"example": True})
    payment_amount: float = Field(0.0, ge=0, description="Сумма оплаты", json_schema_extra={"example": 2500.0})
    # Система и тип неисправности
    system_id: Optional[int] = Field(None, description="ID системы обслуживания", json_schema_extra={"example": 1})
    system_type: Optional[str] = Field(None, description="Тип системы (video_surveillance, intercom, etc.)", json_schema_extra={"example": "video_surveillance"})
    defect_type: Optional[str] = Field(None, description="Тип неисправности", json_schema_extra={"example": "Нет изображения"})
    comments: List[CommentResponse] = Field([], description="История комментариев и изменений")


T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    """Ответ с пагинацией"""
    model_config = ConfigDict(from_attributes=True)
    
    items: List[T]
    total: int
    page: int
    size: int
    pages: int


class TaskListResponse(BaseModel):
    """Краткий ответ для списка"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    task_number: Optional[str] = None
    title: str
    raw_address: str
    description: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    lat: float
    lon: float
    status: str
    priority: int
    created_at: datetime
    updated_at: datetime
    planned_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    assigned_user_id: Optional[int] = None
    assigned_user_name: Optional[str] = None
    is_remote: bool = False
    is_paid: bool = False
    payment_amount: float = 0.0
    # Система и тип неисправности
    system_id: Optional[int] = None
    system_type: Optional[str] = None
    defect_type: Optional[str] = None
    comments_count: int = 0
