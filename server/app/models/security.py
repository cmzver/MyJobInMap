"""
Security Models
===============
Модели защиты доступа по IP: блокировки, белый список и журнал событий.

Используются сервисом ``ip_guard`` и middleware для защиты от перебора
паролей (brute-force) и всплесков запросов (DDoS), а также админ-панелью
портала для просмотра и ручного управления блокировками.
"""

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.models.base import Base, utcnow


class BlockedIPModel(Base):
    """Заблокированный IP-адрес.

    Бан может быть временным (``expires_at`` в будущем) или постоянным
    (``is_permanent=True`` / ``expires_at IS NULL``). ``hit_count`` считает,
    сколько запросов было отклонено уже после установки бана.
    """

    __tablename__ = "blocked_ips"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), unique=True, nullable=False, index=True)

    # Причина и происхождение бана
    reason = Column(String(255), nullable=True)
    is_manual = Column(Boolean, default=False)  # добавлен администратором вручную
    is_permanent = Column(Boolean, default=False)  # никогда не истекает

    created_at = Column(DateTime, default=utcnow, index=True)
    # NULL => постоянная блокировка
    expires_at = Column(DateTime, nullable=True, index=True)

    hit_count = Column(Integer, default=0)
    last_hit_at = Column(DateTime, nullable=True)

    # username администратора, либо "system" для авто-бана
    created_by = Column(String(100), nullable=True)


class IPAllowlistModel(Base):
    """IP из белого списка — никогда не банится автоматически.

    Полезно для офисных адресов, мониторинга и тестов нагрузки.
    """

    __tablename__ = "ip_allowlist"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), unique=True, nullable=False, index=True)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    created_by = Column(String(100), nullable=True)


class IPSecurityEventModel(Base):
    """Журнал событий безопасности для ленты в админ-панели.

    Типы (``event_type``): login_failed, auto_banned, manual_banned,
    manual_unbanned, request_blocked, ddos_banned.
    """

    __tablename__ = "ip_security_events"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), nullable=False, index=True)
    event_type = Column(String(40), nullable=False, index=True)
    username = Column(String(150), nullable=True)  # для login_failed — введённый логин
    detail = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
