"""
������ ������ � ��������� ���������.

��������: ������� ������ ������, ������� �� ������������,
������������, ���������, ��������, �������.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow

if TYPE_CHECKING:
    from app.models.organization import OrganizationModel
    from app.models.user import UserModel

# ============================================
# Enums
# ============================================


class SystemType(str, Enum):
    """���� ������ �� ������������"""

    VIDEO_SURVEILLANCE = "video_surveillance"  # ���������������
    INTERCOM = "intercom"  # ���������
    FIRE_PROTECTION = "fire_protection"  # ����
    ACCESS_CONTROL = "access_control"  # ���
    FIRE_ALARM = "fire_alarm"  # ���
    OTHER = "other"  # ������


class SystemStatus(str, Enum):
    """������� ������"""

    ACTIVE = "active"  # �������
    MAINTENANCE = "maintenance"  # �� �������/������������
    DISABLED = "disabled"  # ���������


class EquipmentType(str, Enum):
    """���� ������������"""

    CAMERA = "camera"  # ������
    DVR = "dvr"  # ����������������
    INTERCOM_PANEL = "intercom_panel"  # ���������� ������
    INTERCOM_HANDSET = "intercom_handset"  # ������ ��������
    SENSOR = "sensor"  # ������
    CONTROLLER = "controller"  # ����������
    READER = "reader"  # �����������
    LOCK = "lock"  # �����
    SWITCH = "switch"  # ����������
    ROUTER = "router"  # ������
    UPS = "ups"  # ���
    OTHER = "other"  # ������


class EquipmentStatus(str, Enum):
    """������� ������������"""

    WORKING = "working"  # ��������
    FAULTY = "faulty"  # ����������
    DISMANTLED = "dismantled"  # �������������


class DocumentType(str, Enum):
    """���� ����������"""

    CONTRACT = "contract"  # �������
    ESTIMATE = "estimate"  # �����
    ACT = "act"  # ���
    SCHEME = "scheme"  # �����
    PASSPORT = "passport"  # ������� ������������
    OTHER = "other"  # ������


class ContactType(str, Enum):
    """���� ���������"""

    CHAIRMAN = "chairman"  # ������������
    ELDER = "elder"  # ������� �� ����
    MANAGEMENT = "management"  # ��
    CONCIERGE = "concierge"  # ��������
    OTHER = "other"  # ������


class AddressHistoryEventType(str, Enum):
    """���� ������� � ������� �������"""

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
    """������ ������ � ���� ������"""

    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # �������� ����������
    address: Mapped[str] = mapped_column(
        String(500), nullable=False, index=True, unique=True
    )
    city: Mapped[str] = mapped_column(String(100), nullable=True, default="")  # �����
    street: Mapped[str] = mapped_column(String(200), nullable=True, default="")  # �����
    building: Mapped[str] = mapped_column(
        String(50), nullable=True, default=""
    )  # ����� ����
    corpus: Mapped[str] = mapped_column(
        String(20), nullable=True, default=""
    )  # ������/��������
    entrance: Mapped[str] = mapped_column(
        String(10), nullable=True, default=""
    )  # �������

    # ����������
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ���������� � ������
    entrance_count: Mapped[int] = mapped_column(
        Integer, nullable=True, default=1
    )  # ���������� ���������
    floor_count: Mapped[int] = mapped_column(
        Integer, nullable=True, default=1
    )  # ���������� ������
    apartment_count: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )  # ���������� �������
    has_elevator: Mapped[bool] = mapped_column(
        Boolean, nullable=True, default=False
    )  # ���� ����
    has_intercom: Mapped[bool] = mapped_column(
        Boolean, nullable=True, default=False
    )  # ���� �������
    intercom_code: Mapped[str] = mapped_column(
        String(50), nullable=True, default=""
    )  # ��� ��������

    # ���������� ����������
    management_company: Mapped[str] = mapped_column(
        String(200), nullable=True, default=""
    )  # ��
    management_phone: Mapped[str] = mapped_column(
        String(50), nullable=True, default=""
    )  # ������� ��

    # �������������
    notes: Mapped[str] = mapped_column(Text, nullable=True, default="")  # �������
    extra_info: Mapped[str] = mapped_column(
        Text, nullable=True, default=""
    )  # �������������� ����������
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )  # ������� �� �����

    # ����������
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=True
    )

    # Multi-tenant
    organization_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("organizations.id"), nullable=True, index=True
    )

    # Relationships
    systems: Mapped[List["AddressSystemModel"]] = relationship(
        "AddressSystemModel", back_populates="address", cascade="all, delete-orphan"
    )
    equipment: Mapped[List["AddressEquipmentModel"]] = relationship(
        "AddressEquipmentModel", back_populates="address", cascade="all, delete-orphan"
    )
    documents: Mapped[List["AddressDocumentModel"]] = relationship(
        "AddressDocumentModel", back_populates="address", cascade="all, delete-orphan"
    )
    contacts: Mapped[List["AddressContactModel"]] = relationship(
        "AddressContactModel", back_populates="address", cascade="all, delete-orphan"
    )
    history: Mapped[List["AddressHistoryModel"]] = relationship(
        "AddressHistoryModel", back_populates="address", cascade="all, delete-orphan"
    )
    organization: Mapped[Optional["OrganizationModel"]] = relationship(
        "OrganizationModel", back_populates="addresses"
    )

    def __repr__(self):
        return f"<Address(id={self.id}, address='{self.address}')>"


class AddressSystemModel(Base):
    """������� �� ������������ �������"""

    __tablename__ = "address_systems"
    __table_args__ = (
        Index("ix_address_systems_address_id", "address_id"),
        Index("ix_address_systems_type", "system_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    address_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )

    system_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default=SystemType.OTHER.value
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SystemStatus.ACTIVE.value
    )

    contract_number: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )  # ����� ��������
    service_start_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )  # ������ ������������
    service_end_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )  # ����� ������������
    monthly_cost: Mapped[float] = mapped_column(
        Float, nullable=True, default=0
    )  # ����������� �����

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=True
    )

    # Relationships
    address: Mapped["AddressModel"] = relationship(
        "AddressModel", back_populates="systems"
    )
    equipment: Mapped[List["AddressEquipmentModel"]] = relationship(
        "AddressEquipmentModel", back_populates="system", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<AddressSystem(id={self.id}, name='{self.name}', type='{self.system_type}')>"


class AddressEquipmentModel(Base):
    """������������ �� �������"""

    __tablename__ = "address_equipment"
    __table_args__ = (
        Index("ix_address_equipment_address_id", "address_id"),
        Index("ix_address_equipment_system_id", "system_id"),
        Index("ix_address_equipment_type", "equipment_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    address_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )
    system_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("address_systems.id", ondelete="SET NULL"), nullable=True
    )

    equipment_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default=EquipmentType.OTHER.value
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    quantity: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )  # ����������
    location: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )  # ������������

    install_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )  # ���� ���������
    warranty_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )  # �������� ��
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EquipmentStatus.WORKING.value
    )

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=True
    )

    # Relationships
    address: Mapped["AddressModel"] = relationship(
        "AddressModel", back_populates="equipment"
    )
    system: Mapped[Optional["AddressSystemModel"]] = relationship(
        "AddressSystemModel", back_populates="equipment"
    )

    def __repr__(self):
        return (
            f"<AddressEquipment(id={self.id}, name='{self.name}', qty={self.quantity})>"
        )


class AddressDocumentModel(Base):
    """�������� �������"""

    __tablename__ = "address_documents"
    __table_args__ = (
        Index("ix_address_documents_address_id", "address_id"),
        Index("ix_address_documents_type", "doc_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    address_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(300), nullable=False)
    doc_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default=DocumentType.OTHER.value
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mime_type: Mapped[str] = mapped_column(
        String(100), nullable=True, default="application/octet-stream"
    )

    valid_from: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )  # ��������� �
    valid_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )  # ��������� ��

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    created_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    address: Mapped["AddressModel"] = relationship(
        "AddressModel", back_populates="documents"
    )
    created_by: Mapped[Optional["UserModel"]] = relationship("UserModel")

    def __repr__(self):
        return f"<AddressDocument(id={self.id}, name='{self.name}')>"


class AddressContactModel(Base):
    """������� �������"""

    __tablename__ = "address_contacts"
    __table_args__ = (Index("ix_address_contacts_address_id", "address_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    address_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )

    contact_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ContactType.OTHER.value
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )  # ���������
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_primary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )  # �������� �������

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=True
    )

    # Relationships
    address: Mapped["AddressModel"] = relationship(
        "AddressModel", back_populates="contacts"
    )

    def __repr__(self):
        return f"<AddressContact(id={self.id}, name='{self.name}')>"


class AddressHistoryModel(Base):
    """������� ��������� �������"""

    __tablename__ = "address_history"
    __table_args__ = (
        Index("ix_address_history_address_id", "address_id"),
        Index("ix_address_history_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    address_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )

    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )

    # Relationships
    address: Mapped["AddressModel"] = relationship(
        "AddressModel", back_populates="history"
    )
    user: Mapped[Optional["UserModel"]] = relationship("UserModel")

    def __repr__(self):
        return f"<AddressHistory(id={self.id}, event='{self.event_type}')>"
