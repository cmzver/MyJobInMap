"""
Модели адреса и связанных сущностей.

Включает: базовая модель адреса, системы на обслуживании, 
оборудование, документы, контакты, история.
"""
from enum import Enum
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.models.base import Base, utcnow


# ============================================
# Enums
# ============================================

class SystemType(str, Enum):
    """Типы систем на обслуживании"""
    VIDEO_SURVEILLANCE = "video_surveillance"  # Видеонаблюдение
    INTERCOM = "intercom"                      # Домофония
    FIRE_PROTECTION = "fire_protection"        # АППЗ
    ACCESS_CONTROL = "access_control"          # СКД
    FIRE_ALARM = "fire_alarm"                  # ОПС
    OTHER = "other"                            # Другое


class SystemStatus(str, Enum):
    """Статусы систем"""
    ACTIVE = "active"           # Активна
    MAINTENANCE = "maintenance" # На ремонте/профилактике
    DISABLED = "disabled"       # Отключена


class EquipmentType(str, Enum):
    """Типы оборудования"""
    CAMERA = "camera"                    # Камера
    DVR = "dvr"                          # Видеорегистратор
    INTERCOM_PANEL = "intercom_panel"    # Домофонная панель
    INTERCOM_HANDSET = "intercom_handset"# Трубка домофона
    SENSOR = "sensor"                    # Датчик
    CONTROLLER = "controller"            # Контроллер
    READER = "reader"                    # Считыватель
    LOCK = "lock"                        # Замок
    SWITCH = "switch"                    # Коммутатор
    ROUTER = "router"                    # Роутер
    UPS = "ups"                          # ИБП
    OTHER = "other"                      # Другое


class EquipmentStatus(str, Enum):
    """Статусы оборудования"""
    WORKING = "working"       # Работает
    FAULTY = "faulty"         # Неисправно
    DISMANTLED = "dismantled" # Демонтировано


class DocumentType(str, Enum):
    """Типы документов"""
    CONTRACT = "contract"    # Договор
    ESTIMATE = "estimate"    # Смета
    ACT = "act"              # Акт
    SCHEME = "scheme"        # Схема
    PASSPORT = "passport"    # Паспорт оборудования
    OTHER = "other"          # Другое


class ContactType(str, Enum):
    """Типы контактов"""
    CHAIRMAN = "chairman"    # Председатель
    ELDER = "elder"          # Старший по дому
    MANAGEMENT = "management"# УК
    CONCIERGE = "concierge"  # Консьерж
    OTHER = "other"          # Другое


class AddressHistoryEventType(str, Enum):
    """Типы событий в истории объекта"""
    CREATED = "created"
    UPDATED = "updated"
    DOCUMENT_ADDED = "document_added"
    DOCUMENT_REMOVED = "document_removed"
    SYSTEM_ADDED = "system_added"
    SYSTEM_UPDATED = "system_updated"
    EQUIPMENT_ADDED = "equipment_added"
    EQUIPMENT_UPDATED = "equipment_updated"
    CONTACT_ADDED = "contact_added"
    CONTACT_UPDATED = "contact_updated"


# ============================================
# Models
# ============================================

class AddressModel(Base):
    """Модель адреса в базе данных"""
    __tablename__ = "addresses"

    id = Column(Integer, primary_key=True, index=True)
    
    # Основная информация
    address = Column(String(500), nullable=False, index=True, unique=True)
    city = Column(String(100), nullable=True, default="")  # Город
    street = Column(String(200), nullable=True, default="")  # Улица
    building = Column(String(50), nullable=True, default="")  # Номер дома
    corpus = Column(String(20), nullable=True, default="")  # Корпус/строение
    entrance = Column(String(10), nullable=True, default="")  # Подъезд
    
    # Координаты
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    
    # Информация о здании
    entrance_count = Column(Integer, nullable=True, default=1)  # Количество подъездов
    floor_count = Column(Integer, nullable=True, default=1)  # Количество этажей
    apartment_count = Column(Integer, nullable=True)  # Количество квартир
    has_elevator = Column(Boolean, nullable=True, default=False)  # Есть лифт
    has_intercom = Column(Boolean, nullable=True, default=False)  # Есть домофон
    intercom_code = Column(String(50), nullable=True, default="")  # Код домофона
    
    # Контактная информация
    management_company = Column(String(200), nullable=True, default="")  # УК
    management_phone = Column(String(50), nullable=True, default="")  # Телефон УК
    
    # Дополнительно
    notes = Column(Text, nullable=True, default="")  # Заметки
    extra_info = Column(Text, nullable=True, default="")  # Дополнительная информация
    is_active = Column(Boolean, nullable=False, default=True)  # Активен ли адрес
    
    # Метаданные
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    systems = relationship("AddressSystemModel", back_populates="address", cascade="all, delete-orphan")
    equipment = relationship("AddressEquipmentModel", back_populates="address", cascade="all, delete-orphan")
    documents = relationship("AddressDocumentModel", back_populates="address", cascade="all, delete-orphan")
    contacts = relationship("AddressContactModel", back_populates="address", cascade="all, delete-orphan")
    history = relationship("AddressHistoryModel", back_populates="address", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Address(id={self.id}, address='{self.address}')>"


class AddressSystemModel(Base):
    """Система на обслуживании объекта"""
    __tablename__ = "address_systems"
    __table_args__ = (
        Index("ix_address_systems_address_id", "address_id"),
        Index("ix_address_systems_type", "system_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False)
    
    system_type = Column(String(50), nullable=False, default=SystemType.OTHER.value)
    name = Column(String(200), nullable=False)
    status = Column(String(20), nullable=False, default=SystemStatus.ACTIVE.value)
    
    contract_number = Column(String(100), nullable=True)  # Номер договора
    service_start_date = Column(DateTime, nullable=True)  # Начало обслуживания
    service_end_date = Column(DateTime, nullable=True)    # Конец обслуживания
    monthly_cost = Column(Float, nullable=True, default=0)  # Абонентская плата
    
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    address = relationship("AddressModel", back_populates="systems")
    equipment = relationship("AddressEquipmentModel", back_populates="system", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<AddressSystem(id={self.id}, name='{self.name}', type='{self.system_type}')>"


class AddressEquipmentModel(Base):
    """Оборудование на объекте"""
    __tablename__ = "address_equipment"
    __table_args__ = (
        Index("ix_address_equipment_address_id", "address_id"),
        Index("ix_address_equipment_system_id", "system_id"),
        Index("ix_address_equipment_type", "equipment_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False)
    system_id = Column(Integer, ForeignKey("address_systems.id", ondelete="SET NULL"), nullable=True)
    
    equipment_type = Column(String(50), nullable=False, default=EquipmentType.OTHER.value)
    name = Column(String(200), nullable=False)
    model = Column(String(100), nullable=True)
    serial_number = Column(String(100), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)  # Количество
    location = Column(String(200), nullable=True)  # Расположение
    
    install_date = Column(DateTime, nullable=True)     # Дата установки
    warranty_until = Column(DateTime, nullable=True)   # Гарантия до
    status = Column(String(20), nullable=False, default=EquipmentStatus.WORKING.value)
    
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    address = relationship("AddressModel", back_populates="equipment")
    system = relationship("AddressSystemModel", back_populates="equipment")

    def __repr__(self):
        return f"<AddressEquipment(id={self.id}, name='{self.name}', qty={self.quantity})>"


class AddressDocumentModel(Base):
    """Документ объекта"""
    __tablename__ = "address_documents"
    __table_args__ = (
        Index("ix_address_documents_address_id", "address_id"),
        Index("ix_address_documents_type", "doc_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False)
    
    name = Column(String(300), nullable=False)
    doc_type = Column(String(50), nullable=False, default=DocumentType.OTHER.value)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    mime_type = Column(String(100), nullable=True, default="application/octet-stream")
    
    valid_from = Column(DateTime, nullable=True)   # Действует с
    valid_until = Column(DateTime, nullable=True)  # Действует до
    
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    address = relationship("AddressModel", back_populates="documents")
    created_by = relationship("UserModel")

    def __repr__(self):
        return f"<AddressDocument(id={self.id}, name='{self.name}')>"


class AddressContactModel(Base):
    """Контакт объекта"""
    __tablename__ = "address_contacts"
    __table_args__ = (
        Index("ix_address_contacts_address_id", "address_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False)
    
    contact_type = Column(String(50), nullable=False, default=ContactType.OTHER.value)
    name = Column(String(200), nullable=False)
    position = Column(String(200), nullable=True)  # Должность
    phone = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False)  # Основной контакт
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    address = relationship("AddressModel", back_populates="contacts")

    def __repr__(self):
        return f"<AddressContact(id={self.id}, name='{self.name}')>"


class AddressHistoryModel(Base):
    """История изменений объекта"""
    __tablename__ = "address_history"
    __table_args__ = (
        Index("ix_address_history_address_id", "address_id"),
        Index("ix_address_history_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False)
    
    event_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    address = relationship("AddressModel", back_populates="history")
    user = relationship("UserModel")

    def __repr__(self):
        return f"<AddressHistory(id={self.id}, event='{self.event_type}')>"
