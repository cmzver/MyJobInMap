"""Плановое обслуживание, рабочий день, оборудование и материалы."""

from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import assert_task_access
from app.models import (
    AddressEquipmentModel,
    AddressModel,
    CommentModel,
    TaskModel,
    UserModel,
    get_db,
)
from app.models.operations import (
    DayRouteModel,
    MaintenancePlanModel,
    MaterialModel,
    MaterialMovementModel,
    MaterialStockModel,
)
from app.models.outbox import OutboxEventModel
from app.schemas.address import AddressEquipmentResponse
from app.schemas.operations import (
    DayResponse,
    EquipmentPassportResponse,
    MaintenanceCreate,
    MaintenanceResponse,
    MaterialAdjustment,
    MaterialCreate,
    MaterialMovementCreate,
    MaterialMovementResponse,
    MaterialResponse,
    RouteResponse,
    RouteUpdate,
    StockResponse,
)
from app.services import require_permission
from app.services.auth import get_current_admin
from app.services.business_time import business_tz
from app.services.outbox_service import MAX_ATTEMPTS, now_utc, stage_task_event
from app.services.role_utils import is_dispatcher_or_admin_user, is_worker_user
from app.services.tenant_filter import TenantFilter
from app.utils import task_to_list_response

router = APIRouter(prefix="/api", tags=["Operations"])


def scoped_object(db, model, object_id, user):
    row = db.get(model, object_id)
    if row is None:
        raise HTTPException(404, "Запись не найдена")
    TenantFilter(user).enforce_access(row)
    return row


def validate_plan(db, data, user):
    address = scoped_object(db, AddressModel, data.address_id, user)
    if address.organization_id != user.organization_id:
        raise HTTPException(403, "Выберите организацию адреса")
    if data.equipment_id:
        equipment = db.get(AddressEquipmentModel, data.equipment_id)
        if not equipment or equipment.address_id != address.id:
            raise HTTPException(422, "Оборудование не принадлежит адресу")
    if data.assigned_user_id:
        assigned = scoped_object(db, UserModel, data.assigned_user_id, user)
        if (
            not assigned.is_active
            or assigned.organization_id != address.organization_id
        ):
            raise HTTPException(422, "Исполнитель недоступен в этой организации")


@router.get("/maintenance-plans", response_model=list[MaintenanceResponse])
def maintenance_plans(
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    return (
        TenantFilter(user)
        .apply(db.query(MaintenancePlanModel), MaintenancePlanModel)
        .order_by(MaintenancePlanModel.next_date)
        .all()
    )


@router.post("/maintenance-plans", response_model=MaintenanceResponse)
def create_maintenance(
    data: MaintenanceCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    validate_plan(db, data, user)
    values = data.model_dump(mode="json")
    values.update(start_date=data.start_date, end_date=data.end_date)
    row = MaintenancePlanModel(
        **values,
        organization_id=user.organization_id,
        created_by_id=user.id,
        next_date=data.start_date,
    )
    db.add(row)
    db.commit()
    return row


@router.put("/maintenance-plans/{plan_id}", response_model=MaintenanceResponse)
def update_maintenance(
    plan_id: int,
    data: MaintenanceCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    row = scoped_object(db, MaintenancePlanModel, plan_id, user)
    validate_plan(db, data, user)
    if (
        row.start_date != data.start_date
        or row.frequency != data.frequency
        or row.interval != data.interval
    ):
        row.next_date = data.start_date
    for key, value in data.model_dump().items():
        setattr(
            row,
            key,
            [day.isoformat() for day in value] if key == "excluded_dates" else value,
        )
    db.commit()
    return row


def route_user(db, user, user_id):
    if user_id is None or user_id == user.id:
        return user
    if not is_dispatcher_or_admin_user(user):
        raise HTTPException(403, "Доступен только свой маршрут")
    return scoped_object(db, UserModel, user_id, user)


def day_tasks(db, user, day):
    return (
        TenantFilter(user)
        .apply(db.query(TaskModel), TaskModel)
        .filter(
            TaskModel.assigned_user_id == user.id,
            TaskModel.status.in_(["NEW", "IN_PROGRESS"]),
            or_(
                TaskModel.planned_date.is_(None),
                TaskModel.planned_date
                < datetime.combine(day + timedelta(days=1), time.min),
            ),
        )
        .order_by(
            TaskModel.planned_date.is_(None), TaskModel.planned_date, TaskModel.id
        )
        .all()
    )


@router.get("/my-day", response_model=DayResponse)
def get_my_day(
    day: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    day = day or datetime.now(business_tz()).date()
    assigned = route_user(db, user, user_id)
    tasks = day_tasks(db, assigned, day)
    route = db.query(DayRouteModel).filter_by(user_id=assigned.id, day=day).first()
    order = {task_id: i for i, task_id in enumerate(route.task_ids)} if route else {}
    tasks.sort(key=lambda task: order.get(task.id, len(order)))
    return {
        "day": day,
        "user_id": assigned.id,
        "tasks": [task_to_list_response(task) for task in tasks],
    }


@router.put("/my-day", response_model=RouteResponse)
def save_my_day(
    data: RouteUpdate,
    day: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    day = day or datetime.now(business_tz()).date()
    assigned = route_user(db, user, user_id)
    allowed = {task.id for task in day_tasks(db, assigned, day)}
    if not set(data.task_ids).issubset(allowed):
        raise HTTPException(409, "Список заявок изменился. Обновите маршрут")
    row = db.query(DayRouteModel).filter_by(user_id=assigned.id, day=day).first()
    if row is None:
        row = DayRouteModel(user_id=assigned.id, day=day)
        db.add(row)
    row.task_ids = data.task_ids
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "Маршрут изменён другим запросом. Повторите сохранение"
        )
    return {"task_ids": data.task_ids}


@router.get("/equipment/{equipment_id}", response_model=EquipmentPassportResponse)
def equipment_passport(
    equipment_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    equipment = db.get(AddressEquipmentModel, equipment_id)
    if equipment is None:
        raise HTTPException(404, "Оборудование не найдено")
    address = scoped_object(db, AddressModel, equipment.address_id, user)
    tasks = (
        TenantFilter(user)
        .apply(db.query(TaskModel), TaskModel)
        .filter(TaskModel.equipment_id == equipment.id)
    )
    if is_worker_user(user):
        tasks = tasks.filter(TaskModel.assigned_user_id == user.id)
    return {
        "equipment": AddressEquipmentResponse.model_validate(equipment),
        "address": address.address,
        "address_id": address.id,
        "tasks": [
            task_to_list_response(t)
            for t in tasks.order_by(TaskModel.created_at.desc()).limit(100).all()
        ],
    }


class EquipmentLink(BaseModel):
    equipment_id: int | None


@router.put("/tasks/{task_id}/equipment")
def link_equipment(
    task_id: int,
    data: EquipmentLink,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("edit_tasks")),
):
    task = assert_task_access(db, user, task_id, "edit_tasks")
    if data.equipment_id is not None:
        equipment = db.get(AddressEquipmentModel, data.equipment_id)
        if equipment is None:
            raise HTTPException(404, "Оборудование не найдено")
        address = scoped_object(db, AddressModel, equipment.address_id, user)
        if task.address_id != address.id:
            raise HTTPException(422, "Оборудование должно принадлежать адресу заявки")
    task.equipment_id = data.equipment_id
    stage_task_event(db, task, user=user)
    db.commit()
    return task_to_list_response(task)


@router.get("/materials", response_model=list[MaterialResponse])
def materials(
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    return (
        TenantFilter(user)
        .apply(db.query(MaterialModel), MaterialModel)
        .filter(MaterialModel.active.is_(True))
        .order_by(MaterialModel.name)
        .all()
    )


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


@router.get("/materials/stocks", response_model=list[StockResponse])
def material_stocks(
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    assigned = route_user(db, user, user_id)
    rows = (
        db.query(MaterialStockModel, MaterialModel)
        .join(MaterialModel)
        .filter(MaterialStockModel.user_id == assigned.id)
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
        for stock, material in rows.all()
    ]


def movement_response(row, material):
    return MaterialMovementResponse(
        id=row.id,
        material_id=row.material_id,
        material_name=material.name,
        user_id=row.user_id,
        task_id=row.task_id,
        quantity=row.quantity,
        unit=material.unit,
        unit_cost=row.unit_cost,
        total_cost=(abs(row.quantity) * row.unit_cost).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        ),
        reason=row.reason,
        created_at=row.created_at.replace(tzinfo=timezone.utc).isoformat(),
    )


def move_material(db, data, user, task=None):
    from app.services.transactions import ensure_transaction

    ensure_transaction(db)
    material = scoped_object(db, MaterialModel, data.material_id, user)
    if task is not None and task.organization_id != material.organization_id:
        raise HTTPException(403, "Материал должен принадлежать организации заявки")
    assigned = route_user(db, user, data.user_id)
    if assigned.organization_id != material.organization_id:
        raise HTTPException(403, "Материал и исполнитель должны быть одной организации")
    existing = (
        db.query(MaterialMovementModel)
        .filter_by(created_by_id=user.id, operation_id=data.operation_id)
        .first()
    )
    delta = (
        -data.quantity
        if task is not None or getattr(data, "kind", "receipt") == "write_off"
        else data.quantity
    )
    if existing:
        if (
            existing.task_id != (task.id if task else None)
            or existing.material_id != material.id
            or existing.quantity != delta
            or existing.user_id != assigned.id
        ):
            raise HTTPException(422, "Ключ операции уже использован с другими данными")
        return movement_response(existing, material)
    if not material.active:
        raise HTTPException(422, "Материал архивирован")
    stock = (
        db.query(MaterialStockModel)
        .filter_by(material_id=material.id, user_id=assigned.id)
        .first()
    )
    if stock is None:
        try:
            with db.begin_nested():
                stock = MaterialStockModel(
                    material_id=material.id, user_id=assigned.id, quantity=0
                )
                db.add(stock)
                db.flush()
        except IntegrityError:
            stock = (
                db.query(MaterialStockModel)
                .filter_by(material_id=material.id, user_id=assigned.id)
                .one()
            )
    changed = (
        db.query(MaterialStockModel)
        .filter(
            MaterialStockModel.id == stock.id, MaterialStockModel.quantity + delta >= 0
        )
        .update(
            {MaterialStockModel.quantity: MaterialStockModel.quantity + delta},
            synchronize_session=False,
        )
    )
    if not changed:
        db.rollback()
        raise HTTPException(409, "Недостаточно материала у исполнителя")
    row = MaterialMovementModel(
        material_id=material.id,
        user_id=assigned.id,
        task_id=task.id if task else None,
        quantity=delta,
        unit_cost=material.unit_cost,
        reason=data.reason,
        operation_id=data.operation_id,
        created_by_id=user.id,
    )
    db.add(row)
    if task:
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
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Повтор потерянного ответа не списывает остаток дважды.
        existing = (
            db.query(MaterialMovementModel)
            .filter_by(created_by_id=user.id, operation_id=data.operation_id)
            .first()
        )
        if existing:
            return move_material(db, data, user, task)
        raise
    return movement_response(row, material)


@router.post("/materials/adjust", response_model=MaterialMovementResponse)
def adjust_material(
    data: MaterialAdjustment,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    return move_material(db, data, user)


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
    task = assert_task_access(db, user, task_id, "edit_tasks")
    return move_material(db, data, user, task)


@router.get("/equipment/{equipment_id}/qr", response_class=Response)
def equipment_qr(
    equipment_id: int,
    request: Request,
    origin: str | None = Query(None, max_length=300),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    equipment_passport(equipment_id, db, user)
    base = (origin or str(request.base_url)).rstrip("/")
    parsed = urlsplit(base)
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.hostname != request.url.hostname
        or parsed.username
        or parsed.password
        or parsed.path
    ):
        raise HTTPException(422, "Некорректный адрес портала")
    from reportlab.graphics.barcode import createBarcodeDrawing

    drawing = createBarcodeDrawing(
        "QR",
        value=f"{base}/portal/equipment/{equipment_id}",
        width=180,
        height=180,
        barBorder=4,
    )
    return Response(
        drawing.asString("svg"),
        media_type="image/svg+xml",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/outbox")
def outbox_status(
    db: Session = Depends(get_db), user: UserModel = Depends(get_current_admin)
):
    rows = (
        TenantFilter(user)
        .apply(db.query(OutboxEventModel), OutboxEventModel)
        .filter(OutboxEventModel.delivered_at.is_(None))
        .order_by(OutboxEventModel.id)
        .limit(100)
        .all()
    )
    return [
        {
            "id": row.id,
            "kind": row.kind,
            "attempts": row.attempts,
            "failed": row.attempts >= MAX_ATTEMPTS,
            "last_error": row.last_error,
            "created_at": row.created_at,
            "available_at": row.available_at,
        }
        for row in rows
    ]


@router.post("/outbox/{event_id}/retry")
def retry_outbox(
    event_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_admin),
):
    row = scoped_object(db, OutboxEventModel, event_id, user)
    if row.delivered_at:
        raise HTTPException(409, "Событие уже доставлено")
    if row.lease_until and row.lease_until > now_utc():
        raise HTTPException(409, "Событие отправляется")
    row.attempts, row.last_error, row.available_at = 0, None, now_utc()
    db.commit()
    return {"id": row.id, "queued": True}
