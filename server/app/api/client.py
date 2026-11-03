"""Кабинет клиента: /api/client/* — для представителей контрагента (УК/ТСЖ).

Только токены кабинета (``type = "client"``); вся выборка ограничена
объектами контрагента представителя (``services/client_cabinet.py``).
Внутренние комментарии сотрудников наружу не отдаются — только смены статуса.
"""

import asyncio
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Literal, Optional
from urllib.parse import quote

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    ActModel,
    AddressModel,
    AddressSystemModel,
    ClientAccountModel,
    CommentModel,
    CounterpartyModel,
    OrganizationModel,
    TaskModel,
    TaskStatus,
    UserModel,
    get_db,
)
from app.models.operations import MaintenanceOccurrenceModel, MaintenancePlanModel
from app.schemas.client import (
    ClientAct,
    ClientActPage,
    ClientLogin,
    ClientMaintenance,
    ClientMe,
    ClientObject,
    ClientPasswordChange,
    ClientSystem,
    ClientTaskCreate,
    ClientTaskDetail,
    ClientTaskEvent,
    ClientTaskItem,
    ClientTaskPage,
    ClientToken,
)
from app.services import client_cabinet as cabinet
from app.services.act_pdf import render_act_pdf
from app.services.act_service import (
    CANCELLED,
    MAX_SIGNATURE_BYTES,
    ActServiceError,
    sign_by_link,
)
from app.services.client_cabinet import get_current_client
from app.services.ip_guard import ip_guard
from app.services.notification_service import create_notification
from app.services.outbox_service import stage_task_event
from app.services.public_url import public_base_url
from app.services.rate_limiter import login_rate_limiter
from app.services.repeat_detector import apply_address_key
from app.services.role_utils import org_managers
from app.services.sla_service import apply_due_at
from app.services.websocket_manager import broadcast_act_updated
from app.utils import get_status_display_name

router = APIRouter(prefix="/api/client", tags=["Client cabinet"])

OPEN_STATUSES = (TaskStatus.NEW.value, TaskStatus.IN_PROGRESS.value)
MAX_STROKES_CHARS = 512 * 1024


def _me(db: Session, account: ClientAccountModel) -> ClientMe:
    counterparty = db.get(CounterpartyModel, account.counterparty_id)
    organization = db.get(OrganizationModel, account.organization_id)
    return ClientMe(
        id=account.id,
        login=account.login,
        full_name=account.full_name,
        position=account.position,
        counterparty_id=account.counterparty_id,
        counterparty_name=counterparty.name if counterparty else "",
        organization_name=organization.name if organization else "",
        organization_phone=organization.phone if organization else None,
    )


# ------------------------------------------------------------------- вход


@router.post("/auth/login", response_model=ClientToken)
def client_login(data: ClientLogin, request: Request, db: Session = Depends(get_db)):
    client_ip = ip_guard.get_client_ip(request)
    allowed, _ = login_rate_limiter.is_allowed(client_ip)
    if not allowed:
        retry_after = login_rate_limiter.get_retry_after(client_ip)
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много попыток входа. Попробуйте через {retry_after} сек.",
            headers={"Retry-After": str(retry_after)},
        )
    account = cabinet.authenticate(db, data.login, data.password)
    if account is None:
        ip_guard.record_login_failure(db, client_ip, f"client:{data.login[:80]}")
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    login_rate_limiter.reset(client_ip)
    account.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return ClientToken(
        access_token=cabinet.create_client_token(account),
        expires_in=int(cabinet.TOKEN_TTL.total_seconds()),
        account=_me(db, account),
    )


@router.get("/me", response_model=ClientMe)
def client_me(
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return _me(db, account)


@router.post("/auth/password", status_code=204)
def client_change_password(
    data: ClientPasswordChange,
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    from app.services.auth import verify_password

    if not verify_password(data.current_password, account.password_hash):
        raise HTTPException(status_code=400, detail="Текущий пароль неверен")
    cabinet.set_password(account, data.new_password)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- объекты


@router.get("/objects", response_model=List[ClientObject])
def client_objects(
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    addresses = (
        cabinet.addresses_query(db, account).order_by(AddressModel.address).all()
    )
    ids = [address.id for address in addresses]
    systems = {}
    for system in db.query(AddressSystemModel).filter(
        AddressSystemModel.address_id.in_(ids)
    ):
        systems.setdefault(system.address_id, []).append(
            ClientSystem(
                id=system.id,
                system_type=system.system_type,
                name=system.name,
                status=system.status,
                contract_number=system.contract_number,
                monthly_cost=system.monthly_cost or Decimal(0),
            )
        )
    open_tasks = dict(
        db.query(TaskModel.address_id, func.count(TaskModel.id))
        .filter(
            TaskModel.organization_id == account.organization_id,
            TaskModel.address_id.in_(ids),
            TaskModel.status.in_(OPEN_STATUSES),
        )
        .group_by(TaskModel.address_id)
        .all()
    )
    next_maintenance = dict(
        db.query(
            MaintenancePlanModel.address_id, func.min(MaintenancePlanModel.next_date)
        )
        .filter(
            MaintenancePlanModel.address_id.in_(ids),
            MaintenancePlanModel.enabled.is_(True),
        )
        .group_by(MaintenancePlanModel.address_id)
        .all()
    )
    return [
        ClientObject(
            id=address.id,
            address=address.address,
            systems=systems.get(address.id, []),
            open_tasks=open_tasks.get(address.id, 0),
            next_maintenance=next_maintenance.get(address.id),
        )
        for address in addresses
    ]


# ---------------------------------------------------------------- заявки


def _task_number(task: TaskModel) -> str:
    return task.task_number or f"Z-{task.id:05d}"


def _acts_count(db: Session, task_ids: List[int]) -> dict:
    if not task_ids:
        return {}
    return dict(
        db.query(ActModel.task_id, func.count(ActModel.id))
        .filter(ActModel.task_id.in_(task_ids), ActModel.status != CANCELLED)
        .group_by(ActModel.task_id)
        .all()
    )


def _task_item(task: TaskModel, acts_count: int = 0) -> dict:
    return dict(
        id=task.id,
        number=_task_number(task),
        title=task.title,
        address=task.raw_address,
        address_id=task.address_id,
        status=task.status,
        status_label=get_status_display_name(task.status),
        priority=task.priority,
        created_at=task.created_at,
        planned_date=task.planned_date,
        completed_at=task.completed_at,
        from_cabinet=task.client_account_id is not None,
        acts_count=acts_count,
    )


@router.get("/tasks", response_model=ClientTaskPage)
def client_tasks(
    status: Literal["open", "done", "all"] = "open",
    address_id: Optional[int] = None,
    search: Optional[str] = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    query = cabinet.tasks_query(db, account)
    if status == "open":
        query = query.filter(TaskModel.status.in_(OPEN_STATUSES))
    elif status == "done":
        query = query.filter(TaskModel.status.notin_(OPEN_STATUSES))
    if address_id:
        query = query.filter(TaskModel.address_id == address_id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            TaskModel.title.ilike(pattern)
            | TaskModel.raw_address.ilike(pattern)
            | TaskModel.task_number.ilike(pattern)
        )
    total = query.count()
    tasks = (
        query.order_by(TaskModel.created_at.desc(), TaskModel.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    counts = _acts_count(db, [task.id for task in tasks])
    return ClientTaskPage(
        total=total,
        items=[
            ClientTaskItem(**_task_item(task, counts.get(task.id, 0))) for task in tasks
        ],
    )


def _client_act(act: ActModel, task_numbers: dict) -> ClientAct:
    return ClientAct(
        id=act.id,
        number=act.number,
        kind=act.kind,
        status=act.status,
        total_amount=act.total_amount or Decimal(0),
        created_at=act.created_at,
        signed_at=act.signed_at,
        task_id=act.task_id,
        task_number=task_numbers.get(act.task_id),
        period_start=act.period_start,
        customer_name=act.customer_name,
    )


def _events(db: Session, task: TaskModel) -> List[ClientTaskEvent]:
    events = [ClientTaskEvent(at=task.created_at, text="Заявка принята")]
    changes = (
        db.query(CommentModel)
        .filter(CommentModel.task_id == task.id, CommentModel.new_status.isnot(None))
        .order_by(CommentModel.created_at, CommentModel.id)
    )
    for change in changes:
        if change.new_status == change.old_status:
            continue
        events.append(
            ClientTaskEvent(
                at=change.created_at,
                text=f"Статус: {get_status_display_name(change.new_status)}",
            )
        )
    return events


@router.get("/tasks/{task_id}", response_model=ClientTaskDetail)
def client_task(
    task_id: int,
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    task = cabinet.own_task(db, account, task_id)
    acts = (
        db.query(ActModel)
        .filter(ActModel.task_id == task.id)
        .order_by(ActModel.created_at.desc())
        .all()
    )
    executor = (
        db.get(UserModel, task.assigned_user_id) if task.assigned_user_id else None
    )
    numbers = {task.id: _task_number(task)}
    return ClientTaskDetail(
        **_task_item(task, sum(1 for act in acts if act.status != CANCELLED)),
        description=task.description or "",
        executor=(executor.full_name or executor.username) if executor else None,
        events=_events(db, task),
        acts=[_client_act(act, numbers) for act in acts],
    )


@router.post("/tasks", response_model=ClientTaskDetail, status_code=201)
def client_create_task(
    data: ClientTaskCreate,
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    address = (
        cabinet.addresses_query(db, account)
        .filter(AddressModel.id == data.address_id)
        .first()
    )
    if address is None:
        raise HTTPException(status_code=404, detail="Объект не найден")
    raw_address = address.address
    if data.apartment and data.apartment.strip():
        raw_address = f"{raw_address}, кв. {data.apartment.strip()}"
    description = data.description.strip()
    signature = f"Подано из кабинета: {account.full_name}"
    if account.position:
        signature += f" ({account.position})"
    task = TaskModel(
        title=data.title.strip(),
        raw_address=raw_address,
        description=f"{description}\n\n{signature}".strip(),
        customer_name=(data.contact_name or "").strip() or account.full_name,
        customer_phone=(data.contact_phone or "").strip() or account.phone,
        lat=address.lat or 0.0,
        lon=address.lon or 0.0,
        address_id=address.id,
        organization_id=account.organization_id,
        status=TaskStatus.NEW.value,
        priority="URGENT" if data.urgent else "CURRENT",
        client_account_id=account.id,
    )
    apply_due_at(db, task)
    apply_address_key(task)
    db.add(task)
    db.flush()
    task.task_number = f"Z-{task.id:05d}"
    stage_task_event(db, task, "task_created", None, title=task.title)
    counterparty = db.get(CounterpartyModel, account.counterparty_id)
    for manager in org_managers(db, account.organization_id):
        create_notification(
            db,
            manager.id,
            f"Заявка из кабинета: {counterparty.name if counterparty else ''}",
            f"№{task.task_number} · {raw_address} · {task.title}",
            notification_type="task",
            task_id=task.id,
            commit=False,
            broadcast=False,
            durable_external=True,
        )
    db.commit()
    db.refresh(task)
    return client_task(task.id, account, db)


# ------------------------------------------------------------------- акты


@router.get("/acts", response_model=ClientActPage)
def client_acts(
    kind: Optional[Literal["task", "summary"]] = None,
    pending: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    query = cabinet.acts_query(db, account).filter(ActModel.status != CANCELLED)
    if kind:
        query = query.filter(ActModel.kind == kind)
    if pending:
        query = query.filter(ActModel.status == "pending_signature")
    total = query.count()
    acts = (
        query.order_by(ActModel.created_at.desc(), ActModel.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    task_ids = {act.task_id for act in acts if act.task_id}
    numbers = {
        row.id: row.task_number or f"Z-{row.id:05d}"
        for row in db.query(TaskModel.id, TaskModel.task_number).filter(
            TaskModel.id.in_(task_ids)
        )
    }
    return ClientActPage(total=total, items=[_client_act(act, numbers) for act in acts])


@router.get("/acts/{act_id}/pdf")
def client_act_pdf(
    act_id: int,
    request: Request,
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    act = cabinet.own_act(db, account, act_id)
    return Response(
        content=render_act_pdf(act, public_base_url(request)),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(f'Акт {act.number}.pdf')}"
            )
        },
    )


@router.post("/acts/{act_id}/sign", response_model=ClientAct)
async def client_sign_act(
    act_id: int,
    request: Request,
    signature: UploadFile = File(..., description="Подпись, PNG"),
    consent: bool = Form(...),
    strokes: Optional[str] = Form(None, max_length=MAX_STROKES_CHARS),
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Представитель подписывает акт в кабинете — от своего имени."""
    if not consent:
        raise HTTPException(
            status_code=400, detail="Подтвердите, что ознакомились с актом"
        )
    act = cabinet.own_act(db, account, act_id)
    png = await signature.read(MAX_SIGNATURE_BYTES + 1)
    try:
        parsed = json.loads(strokes) if strokes else None
    except ValueError:
        parsed = None
    signer = account.full_name
    if account.position:
        signer = f"{signer}, {account.position}"
    try:
        act = sign_by_link(
            db,
            act,
            png,
            parsed,
            signer,
            ip=ip_guard.get_client_ip(request),
            device=request.headers.get("user-agent"),
            via="cabinet",
        )
    except ActServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    asyncio.ensure_future(
        broadcast_act_updated(
            act_id=act.id,
            task_id=act.task_id,
            number=act.number,
            status=act.status,
            organization_id=act.organization_id,
        )
    )
    numbers = {}
    if act.task_id:
        task = db.get(TaskModel, act.task_id)
        numbers = {task.id: _task_number(task)} if task else {}
    return _client_act(act, numbers)


# --------------------------------------------------------------------- ТО


@router.get("/maintenance", response_model=List[ClientMaintenance])
def client_maintenance(
    account: ClientAccountModel = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    addresses = {a.id: a.address for a in cabinet.addresses_query(db, account)}
    plans = (
        db.query(MaintenancePlanModel)
        .filter(
            MaintenancePlanModel.address_id.in_(list(addresses)),
            MaintenancePlanModel.enabled.is_(True),
        )
        .order_by(MaintenancePlanModel.next_date)
        .all()
    )
    last_done = dict(
        db.query(MaintenanceOccurrenceModel.plan_id, func.max(TaskModel.completed_at))
        .join(TaskModel, TaskModel.id == MaintenanceOccurrenceModel.task_id)
        .filter(
            MaintenanceOccurrenceModel.plan_id.in_([plan.id for plan in plans]),
            TaskModel.status == TaskStatus.DONE.value,
        )
        .group_by(MaintenanceOccurrenceModel.plan_id)
        .all()
    )
    today = date.today()
    return [
        ClientMaintenance(
            plan_id=plan.id,
            title=plan.title,
            address=addresses[plan.address_id],
            address_id=plan.address_id,
            frequency=plan.frequency,
            interval=plan.interval,
            next_date=(
                plan.next_date
                if plan.end_date is None or plan.next_date <= plan.end_date
                else None
            ),
            last_done_at=last_done.get(plan.id),
        )
        for plan in plans
        if plan.end_date is None or plan.end_date >= today
    ]
