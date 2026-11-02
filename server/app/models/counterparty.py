"""
Контрагенты — управляющие компании и ТСЖ как юрлица (раздел 7.9 плана).

К контрагенту привязываются объекты (адреса); по нему раз в месяц выпускается
сводный акт: абонплата систем объектов, работы по актам «по договору» и
перечень выездов.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class CounterpartyModel(Base):
    __tablename__ = "counterparties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Короткое имя для списков («УК Жилкомсервис №2») и полное — для документов
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    inn: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    kpp: Mapped[Optional[str]] = mapped_column(String(9), nullable=True)
    ogrn: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    legal_address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    bik: Mapped[Optional[str]] = mapped_column(String(9), nullable=True)
    account: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    corr_account: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Договор обслуживания: номер и дата — основание сводного акта
    contract_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contract_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Кто подписывает акты со стороны заказчика
    signer_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    signer_position: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )
