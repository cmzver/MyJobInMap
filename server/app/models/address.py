"""
������ ������ � ��������� ���������.

��������: ������� ������ ������, ������� �� ������������,
������������, ���������, ��������, �������.
"""

from enum import Enum

from sqlalchemy import (Boolean, Column, DateTime, Float, ForeignKey, Index,
                        Integer, String, Text)
from sqlalchemy.orm import relationship

from app.models.base import Base, utcnow

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

    id = Column(Integer, primary_key=True, index=True)

    # �������� ����������
    address = Column(String(500), nullable=False, index=True, unique=True)
    city = Column(String(100), nullable=True, default="")  # �����
    street = Column(String(200), nullable=True, default="")  # �����
    building = Column(String(50), nullable=True, default="")  # ����� ����
    corpus = Column(String(20), nullable=True, default="")  # ������/��������
    entrance = Column(String(10), nullable=True, default="")  # �������

    # ����������
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)

    # ���������� � ������
    entrance_count = Column(Integer, nullable=True, default=1)  # ���������� ���������
    floor_count = Column(Integer, nullable=True, default=1)  # ���������� ������
    apartment_count = Column(Integer, nullable=True)  # ���������� �������
    has_elevator = Column(Boolean, nullable=True, default=False)  # ���� ����
    has_intercom = Column(Boolean, nullable=True, default=False)  # ���� �������
    intercom_code = Column(String(50), nullable=True, default="")  # ��� ��������

    # ���������� ����������
    management_company = Column(String(200), nullable=True, default="")  # ��
    management_phone = Column(String(50), nullable=True, default="")  # ������� ��

    # �������������
    notes = Column(Text, nullable=True, default="")  # �������
    extra_info = Column(Text, nullable=True, default="")  # �������������� ����������
    is_active = Column(Boolean, nullable=False, default=True)  # ������� �� �����

    # ����������
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Multi-tenant
    organization_id = Column(
        Integer, ForeignKey("organizations.id"), nullable=True, index=True
    )

    # Relationships
    systems = relationship(
        "AddressSystemModel", back_populates="address", cascade="all, delete-orphan"
    )
    equipment = relationship(
        "AddressEquipmentModel", back_populates="address", cascade="all, delete-orphan"
    )
    documents = relationship(
        "AddressDocumentModel", back_populates="address", cascade="all, delete-orphan"
    )
    contacts = relationship(
        "AddressContactModel", back_populates="address", cascade="all, delete-orphan"
    )
    history = relationship(
        "AddressHistoryModel", back_populates="address", cascade="all, delete-orphan"
    )
    organization = relationship("OrganizationModel", back_populates="addresses")

    def __repr__(self):
        return f"<Address(id={self.id}, address='{self.address}')>"


class AddressSystemModel(Base):
    """������� �� ������������ �������"""

    __tablename__ = "address_systems"
    __table_args__ = (
        Index("ix_address_systems_address_id", "address_id"),
        Index("ix_address_systems_type", "system_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )

    system_type = Column(String(50), nullable=False, default=SystemType.OTHER.value)
    name = Column(String(200), nullable=False)
    status = Column(String(20), nullable=False, default=SystemStatus.ACTIVE.value)

    contract_number = Column(String(100), nullable=True)  # ����� ��������
    service_start_date = Column(DateTime, nullable=True)  # ������ ������������
    service_end_date = Column(DateTime, nullable=True)  # ����� ������������
    monthly_cost = Column(Float, nullable=True, default=0)  # ����������� �����

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    address = relationship("AddressModel", back_populates="systems")
    equipment = relationship(
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

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )
    system_id = Column(
        Integer, ForeignKey("address_systems.id", ondelete="SET NULL"), nullable=True
    )

    equipment_type = Column(
        String(50), nullable=False, default=EquipmentType.OTHER.value
    )
    name = Column(String(200), nullable=False)
    model = Column(String(100), nullable=True)
    serial_number = Column(String(100), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)  # ����������
    location = Column(String(200), nullable=True)  # ������������

    install_date = Column(DateTime, nullable=True)  # ���� ���������
    warranty_until = Column(DateTime, nullable=True)  # �������� ��
    status = Column(String(20), nullable=False, default=EquipmentStatus.WORKING.value)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    address = relationship("AddressModel", back_populates="equipment")
    system = relationship("AddressSystemModel", back_populates="equipment")

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

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )

    name = Column(String(300), nullable=False)
    doc_type = Column(String(50), nullable=False, default=DocumentType.OTHER.value)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    mime_type = Column(String(100), nullable=True, default="application/octet-stream")

    valid_from = Column(DateTime, nullable=True)  # ��������� �
    valid_until = Column(DateTime, nullable=True)  # ��������� ��

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utcnow)
    created_by_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    address = relationship("AddressModel", back_populates="documents")
    created_by = relationship("UserModel")

    def __repr__(self):
        return f"<AddressDocument(id={self.id}, name='{self.name}')>"


class AddressContactModel(Base):
    """������� �������"""

    __tablename__ = "address_contacts"
    __table_args__ = (Index("ix_address_contacts_address_id", "address_id"),)

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )

    contact_type = Column(String(50), nullable=False, default=ContactType.OTHER.value)
    name = Column(String(200), nullable=False)
    position = Column(String(200), nullable=True)  # ���������
    phone = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False)  # �������� �������

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    address = relationship("AddressModel", back_populates="contacts")

    def __repr__(self):
        return f"<AddressContact(id={self.id}, name='{self.name}')>"


class AddressHistoryModel(Base):
    """������� ��������� �������"""

    __tablename__ = "address_history"
    __table_args__ = (
        Index("ix_address_history_address_id", "address_id"),
        Index("ix_address_history_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    address_id = Column(
        Integer, ForeignKey("addresses.id", ondelete="CASCADE"), nullable=False
    )

    event_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)

    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    address = relationship("AddressModel", back_populates="history")
    user = relationship("UserModel")

    def __repr__(self):
        return f"<AddressHistory(id={self.id}, event='{self.event_type}')>"
