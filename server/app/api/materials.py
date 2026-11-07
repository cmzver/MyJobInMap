"""Склад материалов: справочник, остатки, операции, журнал и обороты.

Расчёты остатков — в ``services/stock_service.py``. Справочник и операции
склада — для диспетчеров (``assign_tasks``); исполнитель видит свои остатки и
списывает материалы на свои заявки.
"""

from collections import defaultdict
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import assert_task_access
from app.models import CommentModel, TaskModel, UserModel, get_db
from app.models.operations import (
    MaterialModel,
    MaterialMovementModel,
    MaterialStockModel,
)
from app.schemas.datetime_utc import iso_utc
from app.schemas.operations import (
    HolderBalance,
    MaterialAdjustment,
    MaterialBalance,
    MaterialCreate,
    MaterialMovementCreate,
    MaterialMovementPage,
    MaterialMovementResponse,
    MaterialOperationCreate,
    MaterialResponse,
    MaterialUpdate,
    StockResponse,
    TurnoverRowResponse,
)
from app.services import require_permission, stock_service
from app.services.outbox_service import stage_task_event
from app.services.role_utils import is_dispatcher_or_admin_user
from app.services.stock_service import Operation, StockError
from app.services.tenant_filter import TenantFilter
from app.utils.money import money

router = APIRouter(prefix="/api", tags=["Materials"])

MONTH = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="ГГГГ-ММ")
_QTY = Decimal("0.001")


def _scoped(db: Session, model, object_id: int, user: UserModel):
    row = db.get(model, object_id)
    if row is None:
        raise HTTPException(404, "Запись не найдена")
    TenantFilter(user).enforce_access(row)
    return row


def _holder(db: Session, user: UserModel, user_id: Optional[int]) -> UserModel:
    """Исполнитель, чьи остатки смотрят: свой — всегда, чужой — диспетчеру."""
    if user_id is None or user_id == user.id:
        return user
    if not is_dispatcher_or_admin_user(user):
        raise HTTPException(403, "Доступны только свои остатки")
    return _scoped(db, UserModel, user_id, user)


def _materials(db: Session, user: UserModel):
    return TenantFilter(user).apply(db.query(MaterialModel), MaterialModel)


# ------------------------------------------------------------- справочник


@router.get("/materials", response_model=list[MaterialResponse])
def list_materials(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    query = _materials(db, user)
    if not include_archived:
        query = query.filter(MaterialModel.active.is_(True))
    return query.order_by(MaterialModel.name).all()


@router.post("/materials", response_model=MaterialResponse)
def create_material(
    data: MaterialCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    row = MaterialModel(**data.model_dump(), organization_id=user.organization_id)
    db.add(row)
    db.commit()
    return row


@router.patch("/materials/{material_id}", response_model=MaterialResponse)
def update_material(
    material_id: int,
    data: MaterialUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    row = _scoped(db, MaterialModel, material_id, user)
    for name, value in data.model_dump(exclude_unset=True).items():
        if name in {"name", "unit", "unit_cost", "active"} and value is None:
            continue
        setattr(row, name, value)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------- остатки


@router.get("/materials/stocks", response_model=list[StockResponse])
def material_stocks(
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    """Остатки одного исполнителя (по умолчанию — свои)."""
    holder = _holder(db, user, user_id)
    rows = (
        db.query(MaterialStockModel, MaterialModel)
        .join(MaterialModel)
        .filter(MaterialStockModel.user_id == holder.id)
    )
    rows = TenantFilter(user).apply(rows, MaterialModel)
    return [
        {
            "material_id": material.id,
            "name": material.name,
            "unit": material.unit,
            "quantity": stock.quantity,
            "user_id": stock.user_id,
        }
        for stock, material in rows.order_by(MaterialModel.name).all()
    ]


@router.get("/materials/balances", response_model=list[MaterialBalance])
def material_balances(
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    """Сводка: остаток склада и у каждого исполнителя по всем материалам."""
    materials = _materials(db, user).order_by(MaterialModel.name).all()
    holders = defaultdict(list)
    rows = (
        db.query(MaterialStockModel, UserModel)
        .join(UserModel, UserModel.id == MaterialStockModel.user_id)
        .filter(
            MaterialStockModel.material_id.in_([m.id for m in materials]),
            MaterialStockModel.quantity != 0,
        )
        .order_by(UserModel.full_name, UserModel.username)
    )
    for stock, holder in rows.all():
        holders[stock.material_id].append(
            HolderBalance(
                user_id=holder.id,
                name=holder.full_name or holder.username,
                quantity=stock.quantity,
            )
        )
    result = []
    for material in materials:
        warehouse = Decimal(material.warehouse_quantity or 0)
        owned = holders.get(material.id, [])
        # Архивный без остатков в сводке не нужен
        if not material.active and warehouse == 0 and not owned:
            continue
        total = warehouse + sum((h.quantity for h in owned), Decimal(0))
        result.append(
            MaterialBalance(
                material_id=material.id,
                name=material.name,
                unit=material.unit,
                unit_cost=material.unit_cost,
                active=material.active,
                warehouse_quantity=warehouse,
                min_quantity=material.min_quantity,
                low=material.min_quantity is not None
                and warehouse < material.min_quantity,
                holders=owned,
                total_quantity=total,
                total_cost=money(total * Decimal(material.unit_cost or 0)),
            )
        )
    return result


# ---------------------------------------------------------------- журнал


def movement_response(
    row: MaterialMovementModel,
    material: MaterialModel,
    holder: Optional[str] = None,
    task_number: Optional[str] = None,
    created_by: Optional[str] = None,
) -> MaterialMovementResponse:
    return MaterialMovementResponse(
        id=row.id,
        material_id=row.material_id,
        material_name=material.name,
        kind=row.kind,
        user_id=row.user_id,
        holder=holder,
        task_id=row.task_id,
        task_number=task_number,
        created_by=created_by,
        quantity=row.quantity,
        unit=material.unit,
        unit_cost=row.unit_cost,
        total_cost=(abs(row.quantity) * row.unit_cost).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        ),
        reason=row.reason,
        created_at=iso_utc(row.created_at),
    )


@router.get("/materials/movements", response_model=MaterialMovementPage)
def material_movements(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    material_id: Optional[int] = None,
    user_id: Optional[int] = Query(None, description="Исполнитель; 0 — склад"),
    kind: Optional[str] = Query(None, max_length=16),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    m = MaterialMovementModel
    query = TenantFilter(user).apply(
        db.query(m, MaterialModel).join(MaterialModel), MaterialModel
    )
    if month:
        start, end = stock_service.month_bounds(month)
        query = query.filter(m.created_at >= start, m.created_at < end)
    if material_id:
        query = query.filter(m.material_id == material_id)
    if user_id is not None:
        query = query.filter(
            m.user_id.is_(None) if user_id == 0 else m.user_id == user_id
        )
    if kind:
        query = query.filter(m.kind == kind)
    total = query.count()
    rows = query.order_by(m.id.desc()).offset(offset).limit(limit).all()
    user_ids = {row.user_id for row, _ in rows} | {row.created_by_id for row, _ in rows}
    names = {
        u.id: u.full_name or u.username
        for u in db.query(UserModel).filter(UserModel.id.in_(user_ids - {None}))
    }
    task_ids = {row.task_id for row, _ in rows if row.task_id}
    numbers = {
        t.id: t.task_number or f"Z-{t.id:05d}"
        for t in db.query(TaskModel.id, TaskModel.task_number).filter(
            TaskModel.id.in_(task_ids)
        )
    }
    return MaterialMovementPage(
        total=total,
        items=[
            movement_response(
                row,
                material,
                holder="Склад" if row.user_id is None else names.get(row.user_id),
                task_number=numbers.get(row.task_id),
                created_by=names.get(row.created_by_id),
            )
            for row, material in rows
        ],
    )


# -------------------------------------------------------------- операции


def _existing(
    db: Session, user: UserModel, operation_id: str
) -> Optional[MaterialMovementModel]:
    return (
        db.query(MaterialMovementModel)
        .filter_by(created_by_id=user.id, operation_id=operation_id)
        .first()
    )


def _commit_operation(
    db: Session, user: UserModel, operation_id: str, make, verify=None
):
    """Провести операцию один раз: повтор с тем же ключом вернёт прежнюю.

    verify(row) проверяет, что ключ использован с теми же данными (422 иначе) —
    и для параллельного повтора, проигравшего гонку на уникальном ключе."""
    try:
        row = make()
        db.commit()
        return row
    except StockError as exc:
        db.rollback()
        raise HTTPException(exc.status_code, exc.message)
    except IntegrityError:
        db.rollback()
        row = _existing(db, user, operation_id)
        if row is None:
            raise
        if verify is not None:
            verify(row)
        return row


def _same(row: MaterialMovementModel, material_id: int, kind: str, task_id) -> None:
    if row.material_id != material_id or row.kind != kind or row.task_id != task_id:
        raise HTTPException(422, "Ключ операции уже использован с другими данными")


@router.post("/materials/operations", response_model=MaterialMovementResponse)
def material_operation(
    data: MaterialOperationCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    """Приход, выдача, возврат, списание или инвентаризация."""
    material = _scoped(db, MaterialModel, data.material_id, user)
    existing = _existing(db, user, data.operation_id)
    if existing is not None:
        _same(existing, material.id, data.kind, None)
        return movement_response(existing, material)
    if not material.active:
        raise HTTPException(422, "Материал в архиве")
    if data.user_id is not None:
        holder = _scoped(db, UserModel, data.user_id, user)
        if holder.organization_id != material.organization_id:
            raise HTTPException(
                403, "Материал и исполнитель должны быть одной организации"
            )
    row = _commit_operation(
        db,
        user,
        data.operation_id,
        lambda: stock_service.apply(
            db,
            Operation(
                kind=data.kind,
                material=material,
                quantity=data.quantity.quantize(_QTY),
                operation_id=data.operation_id,
                created_by_id=user.id,
                user_id=data.user_id,
                reason=data.reason,
            ),
        ),
        verify=lambda row: _same(row, material.id, data.kind, None),
    )
    return movement_response(row, material)


@router.post("/materials/adjust", response_model=MaterialMovementResponse)
def adjust_material(
    data: MaterialAdjustment,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    """Прежний вид операции: выдать исполнителю напрямую или списать у него."""
    holder = _holder(db, user, data.user_id)
    return material_operation(
        MaterialOperationCreate(
            kind=data.kind,
            material_id=data.material_id,
            user_id=holder.id,
            quantity=data.quantity,
            reason=data.reason,
            operation_id=data.operation_id,
        ),
        db,
        user,
    )


# ------------------------------------------------------------ по заявке


@router.get("/tasks/{task_id}/materials", response_model=list[MaterialMovementResponse])
def task_materials(
    task_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    assert_task_access(db, user, task_id)
    rows = (
        db.query(MaterialMovementModel, MaterialModel)
        .join(MaterialModel)
        .filter(MaterialMovementModel.task_id == task_id)
        .order_by(MaterialMovementModel.id)
    )
    return [movement_response(row, material) for row, material in rows.all()]


@router.post("/tasks/{task_id}/materials", response_model=MaterialMovementResponse)
def use_material(
    task_id: int,
    data: MaterialMovementCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("edit_tasks")),
):
    """Списать материал на заявку со своих остатков (или выбранного исполнителя)."""
    task = assert_task_access(db, user, task_id, "edit_tasks")
    material = _scoped(db, MaterialModel, data.material_id, user)
    if task.organization_id != material.organization_id:
        raise HTTPException(403, "Материал должен принадлежать организации заявки")
    holder = _holder(db, user, data.user_id)
    if holder.organization_id != material.organization_id:
        raise HTTPException(403, "Материал и исполнитель должны быть одной организации")
    quantity = data.quantity.quantize(_QTY)
    existing = _existing(db, user, data.operation_id)
    if existing is not None:
        _same(existing, material.id, stock_service.WRITE_OFF, task.id)
        if existing.quantity != -quantity or existing.user_id != holder.id:
            raise HTTPException(422, "Ключ операции уже использован с другими данными")
        return movement_response(existing, material)
    if not material.active:
        raise HTTPException(422, "Материал в архиве")

    def write_off():
        row = stock_service.post(
            db,
            material=material,
            user_id=holder.id,
            delta=-quantity,
            kind=stock_service.WRITE_OFF,
            operation_id=data.operation_id,
            created_by_id=user.id,
            task_id=task.id,
            reason=data.reason,
        )
        db.query(TaskModel).filter(TaskModel.id == task.id).update(
            {TaskModel.updated_at: datetime.now(timezone.utc)},
            synchronize_session=False,
        )
        stage_task_event(db, task, user=user)
        db.add(
            CommentModel(
                task_id=task.id,
                author_id=user.id,
                author=user.full_name or user.username,
                text=f"Материалы: {material.name}, {data.quantity} {material.unit}",
            )
        )
        return row

    def verify(row: MaterialMovementModel) -> None:
        _same(row, material.id, stock_service.WRITE_OFF, task.id)
        if row.quantity != -quantity or row.user_id != holder.id:
            raise HTTPException(422, "Ключ операции уже использован с другими данными")

    row = _commit_operation(db, user, data.operation_id, write_off, verify=verify)
    return movement_response(row, material)


# ---------------------------------------------------------------- обороты


def _turnover(db: Session, user: UserModel, month: str):
    return stock_service.turnover(db, user.organization_id, month)


@router.get("/materials/turnover", response_model=list[TurnoverRowResponse])
def material_turnover(
    month: str = MONTH,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    """Обороты за месяц: на начало, получено, на заявки, передано, на конец."""
    return [row.__dict__ for row in _turnover(db, user, month)]


@router.get("/materials/turnover.xlsx")
def material_turnover_xlsx(
    month: str = MONTH,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    content = stock_service.turnover_workbook(_turnover(db, user, month), month)
    filename = quote(f"Обороты материалов {month}.xlsx")
    return Response(
        content=content,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )
