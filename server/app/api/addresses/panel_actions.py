"""
API endpoints для «живого» управления домофонными панелями.

Открытие/закрытие двери, статус замка, JPEG-кадр, код записи ключей.
Все обращения к устройству — строго on-demand (по запросу пользователя),
через WireGuard, общим аккаунтом из settings.BEWARD_*. Действия с дверью
пишутся в аудит (IntercomActionModel).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.addresses.extended import get_address_or_404
from app.models import IntercomActionModel, IntercomPanelModel, get_db
from app.models.user import UserModel
from app.schemas.address import (
    PanelDoorActionResponse,
    PanelLockStatusResponse,
    PanelMifareScanCodeResponse,
)
from app.services import beward
from app.services.auth import get_current_user_required

router = APIRouter(prefix="/api/addresses", tags=["Intercom Panel Actions"])


def get_panel_or_404(
    address_id: int, panel_id: int, db: Session, user: UserModel
) -> IntercomPanelModel:
    """Получить панель объекта (с проверкой доступа к адресу) или 404."""
    get_address_or_404(address_id, db, user)
    panel = (
        db.query(IntercomPanelModel)
        .filter(
            IntercomPanelModel.id == panel_id,
            IntercomPanelModel.address_id == address_id,
        )
        .first()
    )
    if not panel:
        raise HTTPException(status_code=404, detail="Панель не найдена")
    return panel


def _record_action(
    db: Session,
    panel: IntercomPanelModel,
    user: UserModel,
    action: str,
    success: bool,
    detail: Optional[str] = None,
) -> None:
    """Записать действие с дверью в аудит."""
    db.add(
        IntercomActionModel(
            panel_id=panel.id,
            address_id=panel.address_id,
            user_id=user.id,
            action=action,
            success=success,
            detail=detail,
        )
    )
    db.commit()


def _raise_device_error(exc: Exception) -> None:
    """Преобразовать ошибку драйвера в HTTP-ответ."""
    if isinstance(exc, beward.BewardUnreachable):
        raise HTTPException(status_code=504, detail="Панель недоступна")
    if isinstance(exc, beward.BewardAuthError):
        raise HTTPException(status_code=502, detail="Панель отвергла учётные данные")
    raise HTTPException(status_code=502, detail="Ошибка обращения к панели")


async def _door(
    address_id: int,
    panel_id: int,
    action: str,
    db: Session,
    user: UserModel,
) -> PanelDoorActionResponse:
    panel = get_panel_or_404(address_id, panel_id, db, user)
    op = beward.open_door if action == "open" else beward.close_door
    try:
        await op(panel.ip, panel.port)
        is_open = await beward.get_lock_status(panel.ip, panel.port)
    except beward.BewardError as exc:
        _record_action(db, panel, user, action, False, str(exc)[:300])
        _raise_device_error(exc)

    _record_action(db, panel, user, action, True)
    return PanelDoorActionResponse(ok=True, action=action, is_open=is_open)


@router.post(
    "/{address_id}/panels/{panel_id}/door/open",
    response_model=PanelDoorActionResponse,
)
async def open_panel_door(
    address_id: int,
    panel_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Открыть дверь панели."""
    return await _door(address_id, panel_id, "open", db, user)


@router.post(
    "/{address_id}/panels/{panel_id}/door/close",
    response_model=PanelDoorActionResponse,
)
async def close_panel_door(
    address_id: int,
    panel_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Закрыть дверь панели."""
    return await _door(address_id, panel_id, "close", db, user)


@router.get(
    "/{address_id}/panels/{panel_id}/lock-status",
    response_model=PanelLockStatusResponse,
)
async def get_panel_lock_status(
    address_id: int,
    panel_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Статус замка (открыт/закрыт). Read-only."""
    panel = get_panel_or_404(address_id, panel_id, db, user)
    try:
        is_open = await beward.get_lock_status(panel.ip, panel.port)
    except beward.BewardError as exc:
        _raise_device_error(exc)
    return PanelLockStatusResponse(is_open=is_open)


@router.get(
    "/{address_id}/panels/{panel_id}/mifare-scan-code",
    response_model=PanelMifareScanCodeResponse,
)
async def get_panel_mifare_scan_code(
    address_id: int,
    panel_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Код режима записи ключей ('Сканировать по коду') и флаг активности."""
    panel = get_panel_or_404(address_id, panel_id, db, user)
    try:
        code, active = await beward.get_mifare_scan_code(panel.ip, panel.port)
    except beward.BewardError as exc:
        _raise_device_error(exc)
    return PanelMifareScanCodeResponse(code=code, active=active)


@router.get("/{address_id}/panels/{panel_id}/snapshot")
async def get_panel_snapshot(
    address_id: int,
    panel_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """JPEG-кадр с камеры панели (короткий кэш). Read-only, не аудируется."""
    panel = get_panel_or_404(address_id, panel_id, db, user)
    try:
        data = await beward.get_snapshot(panel.ip, panel.port)
    except beward.BewardError as exc:
        _raise_device_error(exc)
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )
