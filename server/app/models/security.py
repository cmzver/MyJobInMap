"""
Security Models
===============
Модели защиты доступа по IP: блокировки, белый список и журнал событий.

Используются сервисом ``ip_guard`` и middleware для защиты от перебора
паролей (brute-force) и всплесков запросов (DDoS), а также админ-панелью
портала для просмотра и ручного управления блокировками.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class BlockedIPModel(Base):
    """Заблокированный IP-адрес.

    Бан может быть временным (``expires_at`` в будущем) или постоянным
    (``is_permanent=True`` / ``expires_at IS NULL``). ``hit_count`` считает,
    сколько запросов было отклонено уже после установки бана.
    """

    __tablename__ = "blocked_ips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ip_address: Mapped[str] = mapped_column(
        String(45), unique=True, nullable=False, index=True
    )

    # Причина и происхождение бана
    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_manual: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=True
    )  # добавлен администратором вручную
    is_permanent: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=True
    )  # никогда не истекает

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, index=True, nullable=True
    )
    # NULL => постоянная блокировка
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, index=True
    )

    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    last_hit_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # username администратора, либо "system" для авто-бана
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class IPAllowlistModel(Base):
    """IP из белого списка — никогда не банится автоматически.

    Полезно для офисных адресов, мониторинга и тестов нагрузки.
    """

    __tablename__ = "ip_allowlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ip_address: Mapped[str] = mapped_column(
        String(45), unique=True, nullable=False, index=True
    )
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=True
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class IPSecurityEventModel(Base):
    """Журнал событий безопасности для ленты в админ-панели.

    Типы (``event_type``): login_failed, auto_banned, manual_banned,
    manual_unbanned, request_blocked, ddos_banned.
    """

    __tablename__ = "ip_security_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    username: Mapped[Optional[str]] = mapped_column(
        String(150), nullable=True
    )  # для login_failed — введённый логин
    detail: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, index=True, nullable=True
    )
