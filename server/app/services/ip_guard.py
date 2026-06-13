"""
IP Guard Service
================
Защита приложения на уровне FastAPI (аналог fail2ban внутри приложения):

* определение реального IP клиента (с учётом реверс-прокси Caddy/nginx);
* персистентный бан-лист и белый список в БД;
* авто-бан при переборе паролей (brute-force) по неудачным входам;
* авто-бан при всплеске запросов (DDoS) — глобальный rate limit по IP;
* журнал событий для ленты в админ-панели.

Middleware ([main.py]) на каждый запрос вызывает :meth:`IPGuard.evaluate`,
а эндпоинт логина — :meth:`IPGuard.record_login_failure`. Пороги хранятся в
системных настройках (группа ``security``) и редактируются из админки, поэтому
кэшируются на :data:`IPGuard.CACHE_TTL` секунд, чтобы не дёргать БД на каждый
запрос.
"""

import ipaddress
import logging
import threading
import time
from datetime import timedelta, timezone
from typing import Dict, Optional, Set

from app.config import settings as app_settings
from app.models.base import utcnow
from app.models.security import (
    BlockedIPModel,
    IPAllowlistModel,
    IPSecurityEventModel,
)
from app.models.settings import get_setting
from app.services.rate_limiter import RateLimiter

logger = logging.getLogger("security.ip_guard")

# Значения по умолчанию для порогов (дублируют init_default_settings, чтобы
# guard работал даже до инициализации настроек, напр. в изолированных тестах).
DEFAULTS: Dict[str, object] = {
    "ip_protection_enabled": True,
    "ip_autoban_threshold": 10,
    "ip_autoban_window_minutes": 15,
    "ip_ban_minutes": 60,
    "ddos_protection_enabled": True,
    "ddos_max_requests": 300,
    "ddos_window_seconds": 60,
    "ddos_ban_minutes": 15,
}


def _to_epoch(dt) -> float:
    """Перевести datetime (возможно naive-UTC из SQLite) в epoch-секунды UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def _is_internal_ip(ip: str) -> bool:
    """True для loopback / частных / служебных адресов — их НИКОГДА не авто-баним.

    Предохранитель от само-блокировки: если реальный IP клиента не доходит до
    приложения (``TRUST_PROXY_HEADERS`` выключен, либо SNI-роутер перед Caddy не
    сохраняет источник), все запросы выглядят как ``127.0.0.1``. Без этой проверки
    DDoS/brute-force авто-бан забанил бы loopback и положил весь сайт. Такие
    адреса трактуем как доверенные (как allowlist) — это также авто-снимает уже
    существующий ошибочный бан loopback после деплоя фикса.
    """
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return True  # не смогли распарсить — не баним (fail-safe)
    return (
        addr.is_loopback
        or addr.is_private
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_unspecified
    )


class IPGuard:
    """Потокобезопасный сервис IP-защиты с кэшированием бан-листа в памяти."""

    CACHE_TTL = 15.0  # как часто перечитывать бан-лист/настройки из БД
    EVENT_RETENTION_DAYS = 30  # сколько хранить журнал событий безопасности
    EVENT_PRUNE_INTERVAL = 3600.0  # как часто прунить старые события (сек)

    def __init__(self):
        self._lock = threading.Lock()
        self._blocked: Dict[str, Optional[float]] = (
            {}
        )  # ip -> epoch истечения / None=навсегда
        self._allow: Set[str] = set()
        self._pending_hits: Dict[str, int] = {}  # буфер отклонённых запросов до flush
        self._cfg: Dict[str, object] = dict(DEFAULTS)
        self._cache_at = 0.0
        self._events_pruned_at = 0.0
        self._ddos = RateLimiter(
            max_attempts=int(DEFAULTS["ddos_max_requests"]),
            window_seconds=int(DEFAULTS["ddos_window_seconds"]),
        )
        self._ddos_signature = (
            int(DEFAULTS["ddos_max_requests"]),
            int(DEFAULTS["ddos_window_seconds"]),
        )

    # ------------------------------------------------------------------ IP
    def get_client_ip(self, request) -> str:
        """Реальный IP клиента.

        За доверенным прокси (TRUST_PROXY_HEADERS) берём первый адрес из
        X-Forwarded-For (исходный клиент), иначе X-Real-IP. Без прокси —
        request.client.host. Без доверия заголовкам клиент мог бы подделать
        XFF и обойти бан, поэтому флаг включается только в production за Caddy.
        """
        if app_settings.TRUST_PROXY_HEADERS:
            xff = request.headers.get("x-forwarded-for")
            if xff:
                first = xff.split(",")[0].strip()
                if first:
                    return first
            real = request.headers.get("x-real-ip")
            if real and real.strip():
                return real.strip()
        if request.client:
            return request.client.host
        return "127.0.0.1"

    # --------------------------------------------------------------- config
    def _load_cfg(self, db) -> Dict[str, object]:
        cfg: Dict[str, object] = {}
        for key, default in DEFAULTS.items():
            cfg[key] = get_setting(db, key, default)
        return cfg

    def _cfg_int(self, key: str) -> int:
        try:
            return int(self._cfg.get(key, DEFAULTS[key]))
        except (TypeError, ValueError):
            return int(DEFAULTS[key])

    def _cfg_bool(self, key: str) -> bool:
        return bool(self._cfg.get(key, DEFAULTS[key]))

    # ---------------------------------------------------------------- cache
    def refresh(self, db, force: bool = False) -> None:
        """Перечитать бан-лист, белый список и пороги из БД (не чаще CACHE_TTL)."""
        now = time.time()
        if not force and (now - self._cache_at) < self.CACHE_TTL:
            return

        self._flush_hits(db)

        cfg = self._load_cfg(db)

        # Чистим истёкшие баны, чтобы таблица не разрасталась (история — в событиях)
        try:
            expired = (
                db.query(BlockedIPModel)
                .filter(
                    BlockedIPModel.is_permanent.is_(False),
                    BlockedIPModel.expires_at.isnot(None),
                    BlockedIPModel.expires_at <= utcnow(),
                )
                .all()
            )
            for row in expired:
                db.delete(row)
            if expired:
                db.commit()
        except Exception:
            db.rollback()

        # Прунинг старого журнала событий (раз в EVENT_PRUNE_INTERVAL): раньше
        # его «чистил» destructive delete в record_login_success; теперь история
        # сохраняется для аудита, поэтому ограничиваем её по сроку хранения.
        if now - self._events_pruned_at >= self.EVENT_PRUNE_INTERVAL:
            try:
                cutoff = utcnow() - timedelta(days=self.EVENT_RETENTION_DAYS)
                db.query(IPSecurityEventModel).filter(
                    IPSecurityEventModel.created_at < cutoff
                ).delete(synchronize_session=False)
                db.commit()
                self._events_pruned_at = now
            except Exception:
                db.rollback()

        blocked: Dict[str, Optional[float]] = {}
        for row in db.query(BlockedIPModel).all():
            if row.is_permanent or row.expires_at is None:
                blocked[row.ip_address] = None
            else:
                blocked[row.ip_address] = _to_epoch(row.expires_at)
        allow = {row.ip_address for row in db.query(IPAllowlistModel).all()}

        sig = (int(cfg["ddos_max_requests"]), int(cfg["ddos_window_seconds"]))
        with self._lock:
            self._cfg = cfg
            self._blocked = blocked
            self._allow = allow
            self._cache_at = now
            if sig != self._ddos_signature:
                self._ddos = RateLimiter(max_attempts=sig[0], window_seconds=sig[1])
                self._ddos_signature = sig

    def _flush_hits(self, db) -> None:
        with self._lock:
            pending = self._pending_hits
            self._pending_hits = {}
        if not pending:
            return
        try:
            now = utcnow()
            for ip, cnt in pending.items():
                row = (
                    db.query(BlockedIPModel)
                    .filter(BlockedIPModel.ip_address == ip)
                    .first()
                )
                if row:
                    row.hit_count = (row.hit_count or 0) + cnt
                    row.last_hit_at = now
            db.commit()
        except Exception:
            db.rollback()

    # ------------------------------------------------------------ enforcement
    def evaluate(self, db, ip: str) -> Optional[dict]:
        """Решение для входящего запроса.

        Возвращает dict с ключами ``status`` / ``reason`` / ``retry_after``,
        если запрос нужно отклонить, иначе ``None``.
        """
        self.refresh(db)

        # Внутренние адреса (loopback/частные) всегда пропускаем — не блокируем
        # и не считаем в DDoS-лимите. Это и предохранитель от само-DoS, и
        # авто-восстановление, если loopback уже оказался в бан-листе.
        if _is_internal_ip(ip):
            return None

        with self._lock:
            if ip in self._allow:
                return None

            protection_on = self._cfg_bool("ip_protection_enabled")
            if protection_on and ip in self._blocked:
                exp = self._blocked[ip]
                now = time.time()
                if exp is None or exp > now:
                    self._pending_hits[ip] = self._pending_hits.get(ip, 0) + 1
                    retry = int(exp - now) if exp else None
                    return {"status": 403, "reason": "blocked", "retry_after": retry}
                # истёк — убираем из кэша (из БД удалит refresh)
                del self._blocked[ip]

            ddos_on = self._cfg_bool("ddos_protection_enabled")
            ddos = self._ddos
            ban_minutes = self._cfg_int("ddos_ban_minutes")

        # RateLimiter имеет собственный лок — считаем вне нашего лока
        if ddos_on:
            allowed, _ = ddos.is_allowed(ip)
            if not allowed:
                self.block_ip(
                    db,
                    ip,
                    reason="auto: превышен лимит запросов (DDoS-защита)",
                    duration_minutes=ban_minutes,
                    created_by="system",
                    event_type="ddos_banned",
                )
                return {
                    "status": 429,
                    "reason": "ddos",
                    "retry_after": ban_minutes * 60,
                }

        return None

    # --------------------------------------------------------------- mutations
    def block_ip(
        self,
        db,
        ip: str,
        reason: str,
        duration_minutes: Optional[int] = None,
        permanent: bool = False,
        created_by: str = "system",
        is_manual: bool = False,
        event_type: str = "auto_banned",
    ) -> Optional[BlockedIPModel]:
        # Защита от само-DoS: автоматические баны loopback/частных адресов
        # запрещены (ручной бан админом — is_manual=True — разрешён).
        if not is_manual and _is_internal_ip(ip):
            logger.warning("Отклонён авто-бан внутреннего IP %s (%s)", ip, reason)
            return None

        now = utcnow()
        if permanent:
            expires = None
        else:
            minutes = int(duration_minutes or self._cfg_int("ip_ban_minutes"))
            expires = now + timedelta(minutes=minutes)

        row = db.query(BlockedIPModel).filter(BlockedIPModel.ip_address == ip).first()
        if row:
            row.reason = reason
            row.expires_at = expires
            row.is_permanent = permanent
            row.is_manual = is_manual
            row.created_by = created_by
            row.created_at = now
        else:
            row = BlockedIPModel(
                ip_address=ip,
                reason=reason,
                expires_at=expires,
                is_permanent=permanent,
                is_manual=is_manual,
                created_by=created_by,
                created_at=now,
                hit_count=0,
            )
            db.add(row)

        self._record_event(db, ip, event_type, detail=reason)
        db.commit()

        with self._lock:
            self._blocked[ip] = None if expires is None else expires.timestamp()
        return row

    def unblock_ip(self, db, ip: str, by: str = "system") -> bool:
        row = db.query(BlockedIPModel).filter(BlockedIPModel.ip_address == ip).first()
        if not row:
            return False
        db.delete(row)
        self._record_event(db, ip, "manual_unbanned", detail=f"by {by}")
        db.commit()
        with self._lock:
            self._blocked.pop(ip, None)
        return True

    def add_to_allowlist(
        self, db, ip: str, note: Optional[str] = None, by: str = "system"
    ) -> IPAllowlistModel:
        row = (
            db.query(IPAllowlistModel).filter(IPAllowlistModel.ip_address == ip).first()
        )
        if row:
            row.note = note
            row.created_by = by
        else:
            row = IPAllowlistModel(ip_address=ip, note=note, created_by=by)
            db.add(row)
        # Снимаем активный бан, если он был
        blocked = (
            db.query(BlockedIPModel).filter(BlockedIPModel.ip_address == ip).first()
        )
        if blocked:
            db.delete(blocked)
        db.commit()
        with self._lock:
            self._allow.add(ip)
            self._blocked.pop(ip, None)
        return row

    def remove_from_allowlist(self, db, ip: str) -> bool:
        row = (
            db.query(IPAllowlistModel).filter(IPAllowlistModel.ip_address == ip).first()
        )
        if not row:
            return False
        db.delete(row)
        db.commit()
        with self._lock:
            self._allow.discard(ip)
        return True

    # ------------------------------------------------------------------ login
    def record_login_failure(self, db, ip: str, username: str) -> None:
        """Записать неудачный вход и при превышении порога — авто-бан IP."""
        self._record_event(db, ip, "login_failed", username=username)
        db.commit()

        if not get_setting(
            db, "ip_protection_enabled", DEFAULTS["ip_protection_enabled"]
        ):
            return

        # Внутренние адреса (loopback/частные) не авто-баним — см. _is_internal_ip
        if _is_internal_ip(ip):
            return

        # Белый список не банится
        if db.query(IPAllowlistModel).filter(IPAllowlistModel.ip_address == ip).first():
            return

        threshold = int(
            get_setting(db, "ip_autoban_threshold", DEFAULTS["ip_autoban_threshold"])
        )
        if threshold <= 0:
            return
        window_min = int(
            get_setting(
                db, "ip_autoban_window_minutes", DEFAULTS["ip_autoban_window_minutes"]
            )
        )
        since = utcnow() - timedelta(minutes=window_min)
        # Считаем неудачи только после последнего успешного входа с этого IP:
        # успех сбрасывает счётчик, но историю НЕ удаляем (аудит сохраняется).
        last_success = (
            db.query(IPSecurityEventModel.created_at)
            .filter(
                IPSecurityEventModel.ip_address == ip,
                IPSecurityEventModel.event_type == "login_success",
            )
            .order_by(IPSecurityEventModel.created_at.desc())
            .first()
        )
        if (
            last_success
            and last_success[0]
            and _to_epoch(last_success[0]) > _to_epoch(since)
        ):
            since = last_success[0]
        recent = (
            db.query(IPSecurityEventModel)
            .filter(
                IPSecurityEventModel.ip_address == ip,
                IPSecurityEventModel.event_type == "login_failed",
                IPSecurityEventModel.created_at >= since,
            )
            .count()
        )
        if recent >= threshold:
            ban_min = int(get_setting(db, "ip_ban_minutes", DEFAULTS["ip_ban_minutes"]))
            self.block_ip(
                db,
                ip,
                reason=f"auto: {recent} неудачных входов за {window_min} мин",
                duration_minutes=ban_min,
                created_by="system",
                event_type="auto_banned",
            )

    def record_login_success(self, db, ip: str, username: Optional[str] = None) -> None:
        """Зафиксировать успешный вход.

        Раньше метод УДАЛЯЛ все события ``login_failed`` для IP — это уничтожало
        аудит-журнал (он питает ленту безопасности) и на shared/NAT-IP позволяло
        одним успешным входом сбросить счётчик брутфорса в обход защиты. Теперь
        просто пишем событие ``login_success``; :meth:`record_login_failure`
        считает неудачи только после последнего успеха, поэтому счётчик
        сбрасывается без потери истории.
        """
        try:
            self._record_event(db, ip, "login_success", username=username)
            db.commit()
        except Exception:
            db.rollback()

    # ------------------------------------------------------------------ events
    def _record_event(
        self,
        db,
        ip: str,
        event_type: str,
        username: Optional[str] = None,
        detail: Optional[str] = None,
    ) -> None:
        db.add(
            IPSecurityEventModel(
                ip_address=ip,
                event_type=event_type,
                username=username,
                detail=detail,
            )
        )

    # ------------------------------------------------------------------- stats
    def runtime_stats(self) -> Dict[str, int]:
        """In-memory статистика DDoS-лимитера (без обращения к БД)."""
        return self._ddos.get_stats()

    # ------------------------------------------------------------------- reset
    def reset(self) -> None:
        """Сбросить in-memory состояние (бан-кэш, allow-list, DDoS-счётчики).

        Не трогает БД и конфиг. Используется тестами для изоляции между
        запусками, чтобы накопленные обращения одного IP не давали ложный
        бан/DDoS-блок.
        """
        with self._lock:
            self._blocked.clear()
            self._allow.clear()
            self._pending_hits.clear()
            self._cache_at = 0.0
            self._ddos.clear_all()


# Глобальный singleton, используется middleware и эндпоинтами
ip_guard = IPGuard()
