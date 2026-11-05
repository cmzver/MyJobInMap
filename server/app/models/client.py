"""Входы в кабинет клиента — представители контрагента (УК/ТСЖ).

Это не пользователи системы: у них свой вход, токен с ``type = "client"`` и
только эндпоинты ``/api/client/*``. Видят объекты своего контрагента.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class ClientAccountModel(Base):
    __tablename__ = "client_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    counterparty_id: Mapped[int] = mapped_column(
        ForeignKey("counterparties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Логин глобально уникален: при входе организация ещё неизвестна
    login: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[Optional[str]] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    email: Mapped[Optional[str]] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Смена пароля или отключение делает выданные токены недействительными
    auth_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
