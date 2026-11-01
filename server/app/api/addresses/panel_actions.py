"""
API endpoints для «живого» управления домофонными панелями.

Открытие/закрытие двери, статус замка, JPEG-кадр, код записи ключей.
Все обращения к устройству — строго on-demand (по запросу пользователя),
через WireGuard, общим аккаунтом из settings.BEWARD_*. Действия с дверью
пишутся в аудит (IntercomActionModel).

Из карточки заявки действие приходит с ?task_id=: оно попадает и в историю
заявки — видно, что решили удалённо и как.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.addresses.extended import get_address_or_404
from app.api.deps import assert_task_access
from app.models import (
    AddressAssigneeModel,
    CommentModel,
    IntercomActionModel,
    IntercomPanelModel,
    TaskModel,
    TaskStatus,
    get_db,
)
from app.models.user import UserModel
from app.schemas.address import (
    PanelDoorActionResponse,
    PanelLockStatusResponse,
    PanelMifareScanCodeResponse,
)
from app.services import beward
from app.services.auth import get_current_user_required
from app.services.role_utils import is_dispatcher_or_admin_user

router = APIRouter(prefix="/api/addresses", tags=["Intercom Panel Actions"])


OPEN_TASK_STATUSES = (TaskStatus.NEW.value, TaskStatus.IN_PROGRESS.value)


def has_panel_access(address_id: int, db: Session, user: UserModel) -> bool:
    """Менеджеры — всегда; остальные — если отвечают за адрес или у них есть
    открытая заявка на нём (закрыть свою заявку можно и не будучи ответственным).
    """
    if is_dispatcher_or_admin_user(user):
        return True
    assigned = (
        db.query(AddressAssigneeModel.id)
        .filter(
            AddressAssigneeModel.address_id == address_id,
            AddressAssigneeModel.user_id == user.id,
        )
        .first()
    )
    if assigned:
        return True
    open_task = (
        db.query(TaskModel.id)
        .filter(
            TaskModel.address_id == address_id,
            TaskModel.assigned_user_id == user.id,
            TaskModel.status.in_(OPEN_TASK_STATUSES),
        )
        .first()
    )
    return open_task is not None


def _enforce_panel_access(address_id: int, db: Session, user: UserModel) -> None:
    """Закрывает возможность для рядового сотрудника управлять дверью любого
    адреса организации по ID."""
    if not has_panel_access(address_id, db, user):
        raise HTTPException(status_code=403, detail="Нет доступа к этой панели")


def get_panel_or_404(
    address_id: int, panel_id: int, db: Session, user: UserModel
) -> IntercomPanelModel:
    """Получить панель объекта (с проверкой доступа к адресу) или 404."""
    get_address_or_404(address_id, db, user)
    _enforce_panel_access(address_id, db, user)
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


def panel_name(panel: IntercomPanelModel) -> str:
    if panel.label:
        return panel.label
    return f"подъезд {panel.entrance}" if panel.entrance else "панель"


def _task_for_action(
    task_id: Optional[int], address_id: int, db: Session, user: UserModel
) -> Optional[TaskModel]:
    """Заявка, из карточки которой пришло действие: доступна и по этому адресу."""
    if task_id is None:
        return None
    task = assert_task_access(db, user, task_id)
    if task.address_id != address_id:
        raise HTTPException(status_code=400, detail="Заявка не по адресу этой панели")
    return task


_ACTION_TEXT = {
    "open": "Дверь открыта удалённо",
    "close": "Дверь закрыта удалённо",
    "scan_code": "Запрошен код записи ключей",
}


def _record_action(
    db: Session,
    panel: IntercomPanelModel,
    user: UserModel,
    action: str,
    success: bool,
    detail: Optional[str] = None,
    task: Optional[TaskModel] = None,
) -> None:
    """Записать действие в аудит, а из карточки заявки — ещё и в её историю."""
    db.add(
        IntercomActionModel(
            panel_id=panel.id,
            address_id=panel.address_id,
            user_id=user.id,
            task_id=task.id if task else None,
            action=action,
            success=success,
            detail=detail,
        )
    )
    if task is not None and action in _ACTION_TEXT:
        result = "успешно" if success else f"не удалось: {detail or 'ошибка панели'}"
        db.add(
            CommentModel(
                task_id=task.id,
                text=f"{_ACTION_TEXT[action]} · {panel_name(panel)} · {result}",
                author=user.full_name or user.username,
                author_id=user.id,
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


def _device_error_text(exc: Exception) -> str:
    if isinstance(exc, beward.BewardUnreachable):
        return "панель недоступна"
    if isinstance(exc, beward.BewardAuthError):
        return "панель отвергла учётные данные"
    return str(exc)[:200] or "ошибка панели"


async def _door(
    address_id: int,
    panel_id: int,
    action: str,
    db: Session,
    user: UserModel,
    task_id: Optional[int] = None,
) -> PanelDoorActionResponse:
    panel = get_panel_or_404(address_id, panel_id, db, user)
    task = _task_for_action(task_id, address_id, db, user)
    op = beward.open_door if action == "open" else beward.close_door
    try:
        await op(panel.ip, panel.port)
        is_open = await beward.get_lock_status(panel.ip, panel.port)
    except beward.BewardError as exc:
        _record_action(db, panel, user, action, False, _device_error_text(exc), task)
        _raise_device_error(exc)

    _record_action(db, panel, user, action, True, task=task)
    return PanelDoorActionResponse(ok=True, action=action, is_open=is_open)


@router.post(
    "/{address_id}/panels/{panel_id}/door/open",
    response_model=PanelDoorActionResponse,
)
async def open_panel_door(
    address_id: int,
    panel_id: int,
    task_id: Optional[int] = Query(None, description="Из карточки заявки"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Открыть дверь панели."""
    return await _door(address_id, panel_id, "open", db, user, task_id)


@router.post(
    "/{address_id}/panels/{panel_id}/door/close",
    response_model=PanelDoorActionResponse,
)
async def close_panel_door(
    address_id: int,
    panel_id: int,
    task_id: Optional[int] = Query(None, description="Из карточки заявки"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Закрыть дверь панели."""
    return await _door(address_id, panel_id, "close", db, user, task_id)


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
    task_id: Optional[int] = Query(None, description="Из карточки заявки"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Код режима записи ключей ('Сканировать по коду') и флаг активности.
    Из карточки заявки запрос отмечается в её истории — без самого кода."""
    panel = get_panel_or_404(address_id, panel_id, db, user)
    task = _task_for_action(task_id, address_id, db, user)
    try:
        code, active = await beward.get_mifare_scan_code(panel.ip, panel.port)
    except beward.BewardError as exc:
        _raise_device_error(exc)
    if task is not None:
        _record_action(db, panel, user, "scan_code", True, task=task)
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
