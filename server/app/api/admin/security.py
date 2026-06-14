"""
Admin Security API
==================
Управление IP-защитой из админ-панели портала: просмотр и ручное управление
блокировками, белый список и лента событий безопасности (перебор паролей,
авто-баны, всплески запросов).

Пороги авто-бана/DDoS хранятся в системных настройках (группа ``security``)
и редактируются через общий /api/admin/settings — отдельных эндпоинтов для них
здесь нет.
"""

import ipaddress
import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    BlockedIPModel,
    IPAllowlistModel,
    IPSecurityEventModel,
    UserModel,
    get_db,
)
from app.models.base import utcnow
from app.services import get_current_admin
from app.services.ip_guard import ip_guard

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/security", tags=["Admin Security"])


# ============================================================================
# Schemas
# ============================================================================


def _validate_ip(value: str) -> str:
    value = (value or "").strip()
    try:
        ipaddress.ip_address(value)
    except ValueError as exc:
        raise ValueError("Некорректный IP-адрес") from exc
    return value


class BlockIPRequest(BaseModel):
    ip_address: str
    reason: Optional[str] = None
    minutes: Optional[int] = None  # длительность; None + permanent=False => дефолт
    permanent: bool = False

    @field_validator("ip_address")
    @classmethod
    def _check_ip(cls, v: str) -> str:
        return _validate_ip(v)


class AllowlistRequest(BaseModel):
    ip_address: str
    note: Optional[str] = None

    @field_validator("ip_address")
    @classmethod
    def _check_ip(cls, v: str) -> str:
        return _validate_ip(v)


# ============================================================================
# Serialization helpers
# ============================================================================


def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


def _ban_to_dict(row: BlockedIPModel) -> dict:
    now = utcnow()
    if row.is_permanent or row.expires_at is None:
        is_active = True
    else:
        expires = row.expires_at
        if expires.tzinfo is None:
            from datetime import timezone

            expires = expires.replace(tzinfo=timezone.utc)
        is_active = expires > now
    return {
        "id": row.id,
        "ip_address": row.ip_address,
        "reason": row.reason,
        "is_manual": bool(row.is_manual),
        "is_permanent": bool(row.is_permanent),
        "created_at": _iso(row.created_at),
        "expires_at": _iso(row.expires_at),
        "hit_count": row.hit_count or 0,
        "last_hit_at": _iso(row.last_hit_at),
        "created_by": row.created_by,
        "is_active": is_active,
    }


def _allow_to_dict(row: IPAllowlistModel) -> dict:
    return {
        "id": row.id,
        "ip_address": row.ip_address,
        "note": row.note,
        "created_at": _iso(row.created_at),
        "created_by": row.created_by,
    }


def _event_to_dict(row: IPSecurityEventModel) -> dict:
    return {
        "id": row.id,
        "ip_address": row.ip_address,
        "event_type": row.event_type,
        "username": row.username,
        "detail": row.detail,
        "created_at": _iso(row.created_at),
    }


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/overview")
async def security_overview(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Сводка для дашборда безопасности: счётчики и статистика."""
    now = utcnow()
    day_ago = now - timedelta(hours=24)

    active_bans = (
        db.query(BlockedIPModel)
        .filter(
            (BlockedIPModel.is_permanent.is_(True))
            | (BlockedIPModel.expires_at.is_(None))
            | (BlockedIPModel.expires_at > now)
        )
        .count()
    )
    total_bans = db.query(BlockedIPModel).count()
    allowlist_count = db.query(IPAllowlistModel).count()

    failed_logins_24h = (
        db.query(IPSecurityEventModel)
        .filter(
            IPSecurityEventModel.event_type == "login_failed",
            IPSecurityEventModel.created_at >= day_ago,
        )
        .count()
    )
    auto_bans_24h = (
        db.query(IPSecurityEventModel)
        .filter(
            IPSecurityEventModel.event_type.in_(["auto_banned", "ddos_banned"]),
            IPSecurityEventModel.created_at >= day_ago,
        )
        .count()
    )

    return {
        "active_bans": active_bans,
        "total_bans": total_bans,
        "allowlist_count": allowlist_count,
        "failed_logins_24h": failed_logins_24h,
        "auto_bans_24h": auto_bans_24h,
        "ddos_tracked_ips": ip_guard.runtime_stats().get("tracked_ips", 0),
        "trust_proxy_headers": bool(settings.TRUST_PROXY_HEADERS),
    }


@router.get("/blocked")
async def list_blocked(
    include_expired: bool = Query(False),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Список заблокированных IP (по умолчанию только активные)."""
    now = utcnow()
    query = db.query(BlockedIPModel)
    if not include_expired:
        query = query.filter(
            (BlockedIPModel.is_permanent.is_(True))
            | (BlockedIPModel.expires_at.is_(None))
            | (BlockedIPModel.expires_at > now)
        )
    rows = query.order_by(BlockedIPModel.created_at.desc()).all()
    return [_ban_to_dict(r) for r in rows]


@router.post("/blocked")
async def block_ip(
    payload: BlockIPRequest,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Заблокировать IP вручную."""
    if (
        db.query(IPAllowlistModel)
        .filter(IPAllowlistModel.ip_address == payload.ip_address)
        .first()
    ):
        raise HTTPException(
            status_code=400,
            detail="IP в белом списке. Сначала удалите его из белого списка.",
        )

    reason = payload.reason or f"Заблокирован вручную ({admin.username})"
    row = ip_guard.block_ip(
        db,
        payload.ip_address,
        reason=reason,
        duration_minutes=payload.minutes,
        permanent=payload.permanent,
        created_by=admin.username,
        is_manual=True,
        event_type="manual_banned",
    )
    if row is None:
        raise HTTPException(status_code=500, detail="Не удалось заблокировать IP.")
    logger.info("Admin %s manually blocked IP %s", admin.username, payload.ip_address)
    return _ban_to_dict(row)


@router.delete("/blocked/{ip_address}")
async def unblock_ip(
    ip_address: str,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Разблокировать IP."""
    removed = ip_guard.unblock_ip(db, ip_address.strip(), by=admin.username)
    if not removed:
        raise HTTPException(status_code=404, detail="IP не найден в списке блокировок")
    logger.info("Admin %s unblocked IP %s", admin.username, ip_address)
    return {"success": True}


@router.get("/allowlist")
async def list_allowlist(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Белый список IP (никогда не банятся автоматически)."""
    rows = db.query(IPAllowlistModel).order_by(IPAllowlistModel.created_at.desc()).all()
    return [_allow_to_dict(r) for r in rows]


@router.post("/allowlist")
async def add_allowlist(
    payload: AllowlistRequest,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Добавить IP в белый список (снимает активный бан, если был)."""
    row = ip_guard.add_to_allowlist(
        db, payload.ip_address, note=payload.note, by=admin.username
    )
    logger.info("Admin %s allowlisted IP %s", admin.username, payload.ip_address)
    return _allow_to_dict(row)


@router.delete("/allowlist/{ip_address}")
async def remove_allowlist(
    ip_address: str,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Убрать IP из белого списка."""
    removed = ip_guard.remove_from_allowlist(db, ip_address.strip())
    if not removed:
        raise HTTPException(status_code=404, detail="IP не найден в белом списке")
    return {"success": True}


@router.get("/events")
async def list_events(
    limit: int = Query(100, ge=1, le=500),
    ip_address: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Лента последних событий безопасности (неудачные входы, баны и т.д.)."""
    query = db.query(IPSecurityEventModel)
    if ip_address:
        query = query.filter(IPSecurityEventModel.ip_address == ip_address.strip())
    if event_type:
        query = query.filter(IPSecurityEventModel.event_type == event_type)
    rows = query.order_by(IPSecurityEventModel.created_at.desc()).limit(limit).all()
    return [_event_to_dict(r) for r in rows]
