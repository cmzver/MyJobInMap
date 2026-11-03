"""
Acts API
========
Акты выполненных работ и прайс-лист организации.

Права: view_acts — смотреть, create_acts — оформлять (в том числе с подписью
клиента на телефоне) и прикладывать скан подписанного, manage_acts —
аннулировать и вести прайс. Мастер видит только акты своих заявок.
"""

import json
from datetime import date, datetime, time, timedelta
from typing import List, Optional
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
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, Response
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import TaskAccess, require_task_access
from app.models import (
    ActModel,
    ServiceCatalogItemModel,
    TaskModel,
    UserModel,
    get_db,
)
from app.models.operations import MaterialModel
from app.schemas.act import (
    ActCancelRequest,
    ActCreate,
    ActListResponse,
    ActMobileCreate,
    ActPublicLink,
    ActResponse,
    ActsMoneyByMethod,
    ActsSummaryResponse,
    ActStatus,
    ActsWorkerMoney,
    CatalogItemCreate,
    CatalogItemResponse,
    CatalogItemUpdate,
)
from app.services import require_permission
from app.services.act_pdf import render_act_pdf
from app.services.act_reports import (
    MAX_ARCHIVE_ACTS,
    PAYMENT_ORDER,
    acts_archive,
    acts_workbook,
    summarize,
)
from app.services.act_service import (
    MAX_SCAN_BYTES,
    MAX_SIGNATURE_BYTES,
    ActServiceError,
    ActSigning,
    attach_signed_scan,
    cancel_act,
    create_act,
    issue_public_link,
    scan_path,
)
from app.services.idempotency import IdempotencyKey, cached_response, stage_response
from app.services.public_url import public_base_url
from app.services.role_utils import is_worker_user
from app.services.tenant_filter import TenantFilter

router = APIRouter(tags=["Acts"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _error(exc: ActServiceError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def act_to_response(act: ActModel) -> ActResponse:
    task = (act.content_snapshot or {}).get("task") or {}
    return ActResponse(
        id=act.id,
        number=act.number,
        task_id=act.task_id,
        task_number=task.get("number"),
        address=task.get("address"),
        status=act.status,
        signed_via=act.signed_via,
        signed_at=act.signed_at,
        has_scan=bool(act.scan_file),
        customer_name=act.customer_name,
        customer_role=act.customer_role,
        customer_phone=act.customer_phone,
        apartment=act.apartment,
        work_summary=act.work_summary,
        customer_remarks=act.customer_remarks,
        no_claims=act.no_claims,
        payment_method=act.payment_method,
        total_amount=float(act.total_amount or 0),
        document_hash=act.document_hash,
        supersedes_act_id=act.supersedes_act_id,
        created_at=act.created_at,
        created_by_name=(act.content_snapshot or {}).get("issued_by"),
        cancelled_at=act.cancelled_at,
        cancel_reason=act.cancel_reason,
        refusal_reason=act.refusal_reason,
        has_customer_signature=bool(act.customer_signature_file),
        public_link_expires_at=act.public_link_expires_at,
        kind=act.kind or "task",
        counterparty_id=act.counterparty_id,
        counterparty_name=((act.content_snapshot or {}).get("counterparty") or {}).get(
            "name"
        ),
        period=act.period_start.strftime("%Y-%m") if act.period_start else None,
        lines=[
            {
                "id": line.id,
                "position": line.position,
                "line_type": line.line_type,
                "catalog_item_id": line.catalog_item_id,
                "name": line.name,
                "unit": line.unit,
                "qty": float(line.qty),
                "price": float(line.price),
                "amount": float(line.amount),
                "install_to_object": line.install_to_object,
                "equipment_id": line.equipment_id,
                "serial_number": line.serial_number,
            }
            for line in act.lines
        ],
    )


def _visible_acts(db: Session, user: UserModel):
    query = TenantFilter(user).apply(db.query(ActModel), ActModel)
    if is_worker_user(user):
        query = query.join(TaskModel, TaskModel.id == ActModel.task_id).filter(
            TaskModel.assigned_user_id == user.id
        )
    return query


def _get_act(db: Session, act_id: int, user: UserModel) -> ActModel:
    act = _visible_acts(db, user).filter(ActModel.id == act_id).first()
    if act is None:
        raise HTTPException(status_code=404, detail="Акт не найден")
    return act


def _organization_id(user: UserModel) -> int:
    if user.organization_id is None:
        raise HTTPException(
            status_code=400,
            detail="Прайс ведётся в организации — войдите её пользователем",
        )
    return user.organization_id


# ---------------------------------------------------------------- прайс-лист


@router.get("/api/service-catalog", response_model=List[CatalogItemResponse])
def list_catalog(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    query = db.query(ServiceCatalogItemModel).filter(
        ServiceCatalogItemModel.organization_id == _organization_id(user)
    )
    if not include_inactive:
        query = query.filter(ServiceCatalogItemModel.is_active.is_(True))
    items = query.order_by(
        ServiceCatalogItemModel.sort_order, ServiceCatalogItemModel.name
    ).all()
    return [_catalog_response(item) for item in items]


def _catalog_response(item: ServiceCatalogItemModel) -> CatalogItemResponse:
    return CatalogItemResponse(
        id=item.id,
        name=item.name,
        line_type=item.line_type,
        unit=item.unit,
        price=float(item.price),
        system_type=item.system_type,
        is_active=item.is_active,
        sort_order=item.sort_order,
        material_id=item.material_id,
    )


def _check_material(db: Session, material_id: Optional[int], user: UserModel) -> None:
    if material_id is None:
        return
    material = db.get(MaterialModel, material_id)
    if material is None or material.organization_id != _organization_id(user):
        raise HTTPException(status_code=422, detail="Материал склада не найден")


@router.post(
    "/api/service-catalog", response_model=CatalogItemResponse, status_code=201
)
def create_catalog_item(
    data: CatalogItemCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    _check_material(db, data.material_id, user)
    item = ServiceCatalogItemModel(
        organization_id=_organization_id(user), **data.model_dump()
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _catalog_response(item)


def _own_item(db: Session, item_id: int, user: UserModel) -> ServiceCatalogItemModel:
    item = (
        db.query(ServiceCatalogItemModel)
        .filter(
            ServiceCatalogItemModel.id == item_id,
            ServiceCatalogItemModel.organization_id == _organization_id(user),
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Позиция прайса не найдена")
    return item


@router.patch("/api/service-catalog/{item_id}", response_model=CatalogItemResponse)
def update_catalog_item(
    item_id: int,
    data: CatalogItemUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    item = _own_item(db, item_id, user)
    changes = data.model_dump(exclude_unset=True)
    _check_material(db, changes.get("material_id"), user)
    for name, value in changes.items():
        setattr(item, name, value)
    db.commit()
    db.refresh(item)
    return _catalog_response(item)


@router.delete("/api/service-catalog/{item_id}", status_code=204)
def delete_catalog_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    """Удалить позицию. В выпущенных актах она остаётся — там снимок строки."""
    db.delete(_own_item(db, item_id, user))
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------- акты


@router.post("/api/tasks/{task_id}/acts", response_model=ActResponse, status_code=201)
def create_task_act(
    data: ActCreate,
    access: TaskAccess = Depends(
        require_task_access("create_acts", worker_detail="Нет доступа к этой заявке")
    ),
    db: Session = Depends(get_db),
):
    try:
        act = create_act(db, access.task, data, access.user)
    except ActServiceError as exc:
        raise _error(exc)
    return act_to_response(act)


async def _read_signature(upload: Optional[UploadFile]) -> Optional[bytes]:
    if upload is None:
        return None
    return await upload.read(MAX_SIGNATURE_BYTES + 1)


@router.post(
    "/api/tasks/{task_id}/acts/mobile", response_model=ActResponse, status_code=201
)
async def create_task_act_mobile(
    payload: str = Form(..., description="ActMobileCreate в JSON"),
    customer_signature: Optional[UploadFile] = File(
        None, description="Подпись клиента, PNG"
    ),
    worker_signature: Optional[UploadFile] = File(
        None, description="Подпись мастера, PNG"
    ),
    strokes: Optional[str] = Form(
        None, description="Траектория росчерка клиента (JSON) — доказательство подписи"
    ),
    access: TaskAccess = Depends(
        require_task_access("create_acts", worker_detail="Нет доступа к этой заявке")
    ),
    idempotency_key: IdempotencyKey = None,
    db: Session = Depends(get_db),
):
    """Акт с телефона мастера: подписан на экране, с отказом от подписи или
    ждёт подписи. Повтор из офлайн-очереди с тем же Idempotency-Key вернёт
    уже выпущенный акт — второго не будет."""
    user = access.user
    scope = f"act:{access.task.id}"
    cached = cached_response(db, user.id, idempotency_key, scope)
    if cached is not None:
        return cached
    try:
        data = ActMobileCreate.model_validate_json(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=jsonable_encoder(
                exc.errors(include_url=False, include_context=False)
            ),
        )
    try:
        stroke_data = json.loads(strokes) if strokes else None
    except ValueError:
        raise HTTPException(status_code=422, detail="strokes — не JSON")

    signing = ActSigning.from_payload(
        data,
        await _read_signature(customer_signature),
        await _read_signature(worker_signature),
        stroke_data,
    )
    try:
        act = create_act(
            db,
            access.task,
            data,
            user,
            signing=signing,
            stage=lambda created: stage_response(
                db,
                user.id,
                idempotency_key,
                scope,
                act_to_response(created).model_dump(mode="json"),
                201,
            ),
        )
    except ActServiceError as exc:
        raise _error(exc)
    except IntegrityError:
        # Повтор, пришедший, пока первый запрос ещё выполнялся, — его ответ
        db.rollback()
        cached = cached_response(db, user.id, idempotency_key, scope)
        if cached is None:
            raise
        return cached
    return act_to_response(act)


@router.get("/api/tasks/{task_id}/acts", response_model=List[ActResponse])
def list_task_acts(
    access: TaskAccess = Depends(
        require_task_access("view_acts", worker_detail="Нет доступа к этой заявке")
    ),
    db: Session = Depends(get_db),
):
    acts = (
        db.query(ActModel)
        .options(selectinload(ActModel.lines))
        .filter(ActModel.task_id == access.task.id)
        .order_by(ActModel.created_at.desc(), ActModel.id.desc())
        .all()
    )
    return [act_to_response(act) for act in acts]


def _filtered_acts(
    db: Session,
    user: UserModel,
    status: List[ActStatus],
    date_from: Optional[date],
    date_to: Optional[date],
    search: Optional[str],
    address_id: Optional[int],
):
    query = _visible_acts(db, user)
    if status:
        query = query.filter(ActModel.status.in_(status))
    if date_from is not None:
        query = query.filter(
            ActModel.created_at >= datetime.combine(date_from, time.min)
        )
    if date_to is not None:
        query = query.filter(
            ActModel.created_at
            < datetime.combine(date_to + timedelta(days=1), time.min)
        )
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            ActModel.number.ilike(pattern) | ActModel.customer_name.ilike(pattern)
        )
    if address_id is not None:
        query = query.filter(
            ActModel.task_id.in_(
                db.query(TaskModel.id).filter(TaskModel.address_id == address_id)
            )
        )
    return query


def _ordered(query):
    return query.options(selectinload(ActModel.lines)).order_by(
        ActModel.created_at.desc(), ActModel.id.desc()
    )


@router.get("/api/acts", response_model=ActListResponse)
def list_acts(
    status: List[ActStatus] = Query(default=[]),
    date_from: Optional[date] = Query(None, description="Выпущен не раньше (день)"),
    date_to: Optional[date] = Query(None, description="Выпущен не позже (день)"),
    search: Optional[str] = Query(None, max_length=100),
    address_id: Optional[int] = Query(None, description="Акты заявок по объекту"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    """Реестр актов организации."""
    query = _filtered_acts(db, user, status, date_from, date_to, search, address_id)
    total = query.count()
    acts = _ordered(query).offset((page - 1) * size).limit(size).all()
    return ActListResponse(
        items=[act_to_response(act) for act in acts], total=total, page=page, size=size
    )


@router.get("/api/acts/summary", response_model=ActsSummaryResponse)
def acts_summary(
    status: List[ActStatus] = Query(default=[]),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    address_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    """Деньги по актам за период: итог, по способам оплаты и по исполнителям —
    в т.ч. сколько наличных собрал каждый (основа для подотчёта)."""
    acts = _filtered_acts(
        db, user, status, date_from, date_to, search, address_id
    ).all()
    summary = summarize(acts)
    return ActsSummaryResponse(
        issued=summary.issued,
        signed=summary.signed,
        pending=summary.pending,
        refused=summary.refused,
        total=float(summary.total),
        by_method=[
            ActsMoneyByMethod(
                method=method,
                count=summary.count_by_method[method],
                amount=float(summary.by_method[method]),
            )
            for method in PAYMENT_ORDER
            if summary.count_by_method.get(method)
        ],
        workers=[
            ActsWorkerMoney(
                name=worker.name,
                acts=worker.acts,
                total=float(worker.total),
                cash=float(worker.by_method.get("cash", 0)),
                card=float(worker.by_method.get("card", 0)),
                transfer=float(worker.by_method.get("transfer", 0)),
                contract=float(worker.by_method.get("contract", 0)),
            )
            for worker in sorted(
                summary.workers.values(), key=lambda w: (-w.total, w.name)
            )
        ],
    )


@router.get("/api/acts/export.xlsx")
def export_acts(
    status: List[ActStatus] = Query(default=[]),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    address_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    """Реестр актов по тем же фильтрам, что и список, — Excel."""
    acts = _ordered(
        _filtered_acts(db, user, status, date_from, date_to, search, address_id)
    ).all()
    return Response(
        content=acts_workbook(acts),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": _download("Реестр актов.xlsx")},
    )


@router.get("/api/acts/archive.zip")
def acts_month_archive(
    request: Request,
    month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="ГГГГ-ММ"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    """Акты за месяц одним архивом: PDF, сканы бумажных и реестр Excel.

    Аннулированные не входят — их заменили новые версии."""
    first = date.fromisoformat(f"{month}-01")
    last = (first.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(
        days=1
    )
    query = _filtered_acts(
        db, user, ["pending_signature", "signed", "refused"], first, last, None, None
    )
    if query.count() > MAX_ARCHIVE_ACTS:
        raise HTTPException(
            status_code=413,
            detail=f"За месяц больше {MAX_ARCHIVE_ACTS} актов — выгрузите реестр Excel",
        )
    acts = _ordered(query).all()
    return Response(
        content=acts_archive(acts, public_base_url(request)),
        media_type="application/zip",
        headers={"Content-Disposition": _download(f"Акты {month}.zip")},
    )


@router.get("/api/acts/{act_id}", response_model=ActResponse)
def get_act(
    act_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    return act_to_response(_get_act(db, act_id, user))


def _attachment(filename: str) -> str:
    return f"inline; filename*=UTF-8''{quote(filename)}"


def _download(filename: str) -> str:
    return f"attachment; filename*=UTF-8''{quote(filename)}"


@router.get("/api/acts/{act_id}/pdf")
def get_act_pdf(
    act_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    act = _get_act(db, act_id, user)
    return Response(
        content=render_act_pdf(act, public_base_url(request)),
        media_type="application/pdf",
        headers={"Content-Disposition": _attachment(f"Акт {act.number}.pdf")},
    )


@router.post("/api/acts/{act_id}/scan", response_model=ActResponse)
async def upload_act_scan(
    act_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("create_acts")),
):
    """Скан акта, подписанного на бумаге: акт становится подписанным."""
    act = _get_act(db, act_id, user)
    content = await file.read(MAX_SCAN_BYTES + 1)
    try:
        act = attach_signed_scan(db, act, content, file.content_type or "", user)
    except ActServiceError as exc:
        raise _error(exc)
    return act_to_response(act)


@router.get("/api/acts/{act_id}/scan")
def get_act_scan(
    act_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    act = _get_act(db, act_id, user)
    path = scan_path(act)
    if path is None:
        raise HTTPException(status_code=404, detail="Скана нет")
    return FileResponse(
        path,
        headers={"Content-Disposition": _attachment(f"Акт {act.number}{path.suffix}")},
    )


@router.post("/api/acts/{act_id}/public-link", response_model=ActPublicLink)
def create_public_link(
    act_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("create_acts")),
):
    """Ссылка для клиента: подписать акт позже или забрать PDF. Показывается
    один раз; новая ссылка заменяет прежнюю."""
    act = _get_act(db, act_id, user)
    try:
        token, expires_at = issue_public_link(db, act)
    except ActServiceError as exc:
        raise _error(exc)
    return ActPublicLink(
        url=f"{public_base_url(request)}/portal/a/{token}", expires_at=expires_at
    )


@router.post("/api/acts/{act_id}/cancel", response_model=ActResponse)
def cancel_act_endpoint(
    act_id: int,
    data: ActCancelRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    act = _get_act(db, act_id, user)
    try:
        act = cancel_act(db, act, data.reason, user)
    except ActServiceError as exc:
        raise _error(exc)
    return act_to_response(act)
