"""
Pydantic схемы для работы с адресами и связанными сущностями.

Включает: адрес, системы, оборудование, документы, контакты, история.
"""
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict


# ============================================
# Enums (для валидации)
# ============================================

SYSTEM_TYPES = ["video_surveillance", "intercom", "fire_protection", "access_control", "fire_alarm", "other"]
SYSTEM_STATUSES = ["active", "maintenance", "disabled"]
EQUIPMENT_TYPES = ["camera", "dvr", "intercom_panel", "intercom_handset", "sensor", "controller", "reader", "lock", "switch", "router", "ups", "other"]
EQUIPMENT_STATUSES = ["working", "faulty", "dismantled"]
DOCUMENT_TYPES = ["contract", "estimate", "act", "scheme", "passport", "other"]
CONTACT_TYPES = ["chairman", "elder", "management", "concierge", "other"]


# ============================================
# Address Schemas
# ============================================

class AddressBase(BaseModel):
    """Базовые поля адреса"""
    address: str = Field(..., min_length=1, max_length=500, json_schema_extra={"example": "СПб, Невский пр., 1"})
    city: Optional[str] = Field(None, max_length=100, json_schema_extra={"example": "Санкт-Петербург"})
    street: Optional[str] = Field(None, max_length=200, json_schema_extra={"example": "Невский проспект"})
    building: Optional[str] = Field(None, max_length=50, json_schema_extra={"example": "1"})
    corpus: Optional[str] = Field(None, max_length=20, json_schema_extra={"example": "2"})
    entrance: Optional[str] = Field(None, max_length=10, json_schema_extra={"example": "3"})
    
    # Координаты
    lat: Optional[float] = Field(None, json_schema_extra={"example": 59.9343})
    lon: Optional[float] = Field(None, json_schema_extra={"example": 30.3351})
    
    # Информация о здании
    entrance_count: Optional[int] = Field(1, ge=1, le=50, json_schema_extra={"example": 4})
    floor_count: Optional[int] = Field(1, ge=1, le=100, json_schema_extra={"example": 9})
    apartment_count: Optional[int] = Field(None, ge=1, json_schema_extra={"example": 36})
    has_elevator: Optional[bool] = Field(False, json_schema_extra={"example": True})
    has_intercom: Optional[bool] = Field(False, json_schema_extra={"example": True})
    intercom_code: Optional[str] = Field(None, max_length=50, json_schema_extra={"example": "123#4567"})
    
    # Контактная информация
    management_company: Optional[str] = Field(None, max_length=200, json_schema_extra={"example": "ООО УК Дом"})
    management_phone: Optional[str] = Field(None, max_length=50, json_schema_extra={"example": "+7 (812) 123-45-67"})
    
    # Дополнительно
    notes: Optional[str] = Field(None, max_length=2000, json_schema_extra={"example": "Вход со двора"})
    extra_info: Optional[str] = Field(None, max_length=5000, json_schema_extra={"example": "Доп. информация об объекте"})


class AddressCreate(AddressBase):
    """Создание нового адреса"""
    pass


class AddressUpdate(BaseModel):
    """Обновление адреса (все поля опциональны)"""
    address: Optional[str] = Field(None, min_length=1, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    street: Optional[str] = Field(None, max_length=200)
    building: Optional[str] = Field(None, max_length=50)
    corpus: Optional[str] = Field(None, max_length=20)
    entrance: Optional[str] = Field(None, max_length=10)
    
    lat: Optional[float] = None
    lon: Optional[float] = None
    
    entrance_count: Optional[int] = Field(None, ge=1, le=50)
    floor_count: Optional[int] = Field(None, ge=1, le=100)
    apartment_count: Optional[int] = Field(None, ge=1)
    has_elevator: Optional[bool] = None
    has_intercom: Optional[bool] = None
    intercom_code: Optional[str] = Field(None, max_length=50)
    
    management_company: Optional[str] = Field(None, max_length=200)
    management_phone: Optional[str] = Field(None, max_length=50)
    
    notes: Optional[str] = Field(None, max_length=2000)
    extra_info: Optional[str] = Field(None, max_length=5000)
    is_active: Optional[bool] = None


class AddressResponse(BaseModel):
    """Ответ с данными адреса"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    address: str
    city: Optional[str] = None
    street: Optional[str] = None
    building: Optional[str] = None
    corpus: Optional[str] = None
    entrance: Optional[str] = None
    
    lat: Optional[float] = None
    lon: Optional[float] = None
    
    entrance_count: Optional[int] = None
    floor_count: Optional[int] = None
    apartment_count: Optional[int] = None
    has_elevator: Optional[bool] = None
    has_intercom: Optional[bool] = None
    intercom_code: Optional[str] = None
    
    management_company: Optional[str] = None
    management_phone: Optional[str] = None
    
    notes: Optional[str] = None
    extra_info: Optional[str] = None
    is_active: bool = True
    
    created_at: datetime
    updated_at: datetime


class AddressListResponse(BaseModel):
    """Список адресов с пагинацией"""
    items: List[AddressResponse]
    total: int
    page: int
    size: int
    pages: int


class AddressSearchResponse(BaseModel):
    """Упрощённый ответ для автокомплита"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    address: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    entrance_count: Optional[int] = None
    floor_count: Optional[int] = None
    has_intercom: Optional[bool] = None
    intercom_code: Optional[str] = None


class AddressParseRequest(BaseModel):
    """Запрос на парсинг адреса"""
    address: str


class AddressParseResponse(BaseModel):
    """Результат парсинга адреса"""
    city: Optional[str] = None
    street: Optional[str] = None
    building: Optional[str] = None
    corpus: Optional[str] = None
    entrance: Optional[str] = None


class AddressComposeRequest(BaseModel):
    """Запрос на сборку адреса"""
    city: Optional[str] = None
    street: Optional[str] = None
    building: Optional[str] = None
    corpus: Optional[str] = None
    entrance: Optional[str] = None


class AddressComposeResponse(BaseModel):
    """Результат сборки адреса"""
    address: str


# ============================================
# System Schemas
# ============================================

class AddressSystemBase(BaseModel):
    """Базовые поля системы"""
    system_type: str = Field(..., description="Тип системы")
    name: str = Field(..., min_length=1, max_length=200)
    status: str = Field(default="active", description="Статус системы")
    contract_number: Optional[str] = Field(None, max_length=100)
    service_start_date: Optional[datetime] = None
    service_end_date: Optional[datetime] = None
    monthly_cost: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class AddressSystemCreate(AddressSystemBase):
    """Создание системы"""
    pass


class AddressSystemUpdate(BaseModel):
    """Обновление системы"""
    system_type: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[str] = None
    contract_number: Optional[str] = Field(None, max_length=100)
    service_start_date: Optional[datetime] = None
    service_end_date: Optional[datetime] = None
    monthly_cost: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class AddressSystemResponse(AddressSystemBase):
    """Ответ с системой"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    address_id: int
    created_at: datetime
    updated_at: datetime


# ============================================
# Equipment Schemas
# ============================================

class AddressEquipmentBase(BaseModel):
    """Базовые поля оборудования"""
    equipment_type: str = Field(..., description="Тип оборудования")
    name: str = Field(..., min_length=1, max_length=200)
    model: Optional[str] = Field(None, max_length=100)
    serial_number: Optional[str] = Field(None, max_length=100)
    quantity: int = Field(default=1, ge=1, description="Количество")
    location: Optional[str] = Field(None, max_length=200)
    install_date: Optional[datetime] = None
    warranty_until: Optional[datetime] = None
    status: str = Field(default="working", description="Статус")
    notes: Optional[str] = None
    system_id: Optional[int] = Field(None, description="ID связанной системы")


class AddressEquipmentCreate(AddressEquipmentBase):
    """Создание оборудования"""
    pass


class AddressEquipmentUpdate(BaseModel):
    """Обновление оборудования"""
    equipment_type: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    model: Optional[str] = Field(None, max_length=100)
    serial_number: Optional[str] = Field(None, max_length=100)
    quantity: Optional[int] = Field(None, ge=1)
    location: Optional[str] = Field(None, max_length=200)
    install_date: Optional[datetime] = None
    warranty_until: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    system_id: Optional[int] = None


class AddressEquipmentResponse(AddressEquipmentBase):
    """Ответ с оборудованием"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    address_id: int
    created_at: datetime
    updated_at: datetime


# ============================================
# Document Schemas
# ============================================

class AddressDocumentBase(BaseModel):
    """Базовые поля документа"""
    name: str = Field(..., min_length=1, max_length=300)
    doc_type: str = Field(default="other", description="Тип документа")
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    notes: Optional[str] = None


class AddressDocumentCreate(AddressDocumentBase):
    """Создание документа (без файла, файл загружается отдельно)"""
    pass


class AddressDocumentUpdate(BaseModel):
    """Обновление документа"""
    name: Optional[str] = Field(None, min_length=1, max_length=300)
    doc_type: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    notes: Optional[str] = None


class AddressDocumentResponse(BaseModel):
    """Ответ с документом"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    address_id: int
    name: str
    doc_type: str
    file_path: str
    file_size: int
    mime_type: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None  # Добавляется в API


# ============================================
# Contact Schemas
# ============================================

class AddressContactBase(BaseModel):
    """Базовые поля контакта"""
    contact_type: str = Field(default="other", description="Тип контакта")
    name: str = Field(..., min_length=1, max_length=200)
    position: Optional[str] = Field(None, max_length=200, description="Должность")
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    is_primary: bool = Field(default=False, description="Основной контакт")


class AddressContactCreate(AddressContactBase):
    """Создание контакта"""
    pass


class AddressContactUpdate(BaseModel):
    """Обновление контакта"""
    contact_type: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    position: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    is_primary: Optional[bool] = None


class AddressContactResponse(AddressContactBase):
    """Ответ с контактом"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    address_id: int
    created_at: datetime
    updated_at: datetime


# ============================================
# History Schemas
# ============================================

class AddressHistoryResponse(BaseModel):
    """Ответ с записью истории"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    address_id: int
    event_type: str
    description: str
    user_id: Optional[int] = None
    user_name: Optional[str] = None  # Добавляется в API
    created_at: datetime


# ============================================
# Full Address Card
# ============================================

class TaskStats(BaseModel):
    """Статистика заявок по адресу"""
    total: int = 0
    new: int = 0
    in_progress: int = 0
    done: int = 0
    cancelled: int = 0


class AddressFullResponse(BaseModel):
    """Полная карточка объекта"""
    model_config = ConfigDict(from_attributes=True)
    
    # Базовые поля адреса
    id: int
    address: str
    city: Optional[str] = None
    street: Optional[str] = None
    building: Optional[str] = None
    corpus: Optional[str] = None
    entrance: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    entrance_count: Optional[int] = None
    floor_count: Optional[int] = None
    apartment_count: Optional[int] = None
    has_elevator: Optional[bool] = None
    has_intercom: Optional[bool] = None
    intercom_code: Optional[str] = None
    management_company: Optional[str] = None
    management_phone: Optional[str] = None
    notes: Optional[str] = None
    extra_info: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    
    # Связанные данные
    systems: List[AddressSystemResponse] = []
    equipment: List[AddressEquipmentResponse] = []
    documents: List[AddressDocumentResponse] = []
    contacts: List[AddressContactResponse] = []
    task_stats: TaskStats = TaskStats()
