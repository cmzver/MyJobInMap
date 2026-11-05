"""Склад материалов: проводки по держателям и обороты.

Держатель остатка — склад организации (``user_id`` пустой, остаток в
``materials.warehouse_quantity``) или исполнитель (``material_stocks``).
Каждое изменение остатка — проводка в ``material_movements`` по одному
держателю; передача склад ↔ исполнитель — две проводки с общим основанием.
Остатки — кэш суммы проводок, обороты за месяц считаются по журналу.

Акт по заявке досписывает материалы прайса, связанные со складом: у
исполнителя по заявке должно быть списано не меньше, чем указано в
действующих актах, с учётом того, что он уже списал вручную. Нехватка акт
не блокирует — остаток уходит в минус (недостача видна на странице склада).
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from io import BytesIO
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel
from app.models.act import ActModel
from app.models.operations import (
    MaterialModel,
    MaterialMovementModel,
    MaterialStockModel,
)
from app.services.business_time import business_tz, to_naive_utc
from app.utils.money import money

RECEIPT = "receipt"
ISSUE = "issue"
RETURN = "return"
WRITE_OFF = "write_off"
ACT = "act"
ACT_CANCEL = "act_cancel"
ADJUST = "adjust"

# Операции, которые склад проводит по запросу пользователя (акты — сами).
MANUAL_KINDS = (RECEIPT, ISSUE, RETURN, WRITE_OFF, ADJUST)
# Суффикс основания у второй проводки передачи (на стороне склада).
_WAREHOUSE_SUFFIX = ":wh"


class StockError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _stock_row(db: Session, material_id: int, user_id: int) -> MaterialStockModel:
    stock = (
        db.query(MaterialStockModel)
        .filter_by(material_id=material_id, user_id=user_id)
        .first()
    )
    if stock is not None:
        return stock
    try:
        with db.begin_nested():
            stock = MaterialStockModel(
                material_id=material_id, user_id=user_id, quantity=0
            )
            db.add(stock)
            db.flush()
    except IntegrityError:
        stock = (
            db.query(MaterialStockModel)
            .filter_by(material_id=material_id, user_id=user_id)
            .one()
        )
    return stock


def _change_balance(
    db: Session,
    material: MaterialModel,
    user_id: Optional[int],
    delta: Decimal,
    allow_negative: bool,
) -> bool:
    """Атомарно изменить остаток держателя; False — не хватает остатка."""
    if user_id is None:
        query = db.query(MaterialModel).filter(MaterialModel.id == material.id)
        column = MaterialModel.warehouse_quantity
    else:
        stock = _stock_row(db, material.id, user_id)
        query = db.query(MaterialStockModel).filter(MaterialStockModel.id == stock.id)
        column = MaterialStockModel.quantity
    if not allow_negative and delta < 0:
        query = query.filter(column + delta >= 0)
    return query.update({column: column + delta}, synchronize_session=False) == 1


def post(
    db: Session,
    *,
    material: MaterialModel,
    user_id: Optional[int],
    delta: Decimal,
    kind: str,
    operation_id: str,
    created_by_id: Optional[int],
    task_id: Optional[int] = None,
    reason: str = "",
    allow_negative: bool = False,
) -> MaterialMovementModel:
    """Одна проводка: изменить остаток держателя и записать её в журнал."""
    if not _change_balance(db, material, user_id, delta, allow_negative):
        where = "на складе" if user_id is None else "у исполнителя"
        raise StockError(f"Недостаточно материала {where}", 409)
    row = MaterialMovementModel(
        material_id=material.id,
        user_id=user_id,
        task_id=task_id,
        quantity=delta,
        unit_cost=material.unit_cost,
        reason=reason,
        operation_id=operation_id,
        created_by_id=created_by_id,
        kind=kind,
    )
    db.add(row)
    return row


def balance(db: Session, material: MaterialModel, user_id: Optional[int]) -> Decimal:
    if user_id is None:
        db.refresh(material, ["warehouse_quantity"])
        return Decimal(material.warehouse_quantity or 0)
    stock = (
        db.query(MaterialStockModel)
        .filter_by(material_id=material.id, user_id=user_id)
        .first()
    )
    return Decimal(stock.quantity) if stock else Decimal(0)


@dataclass
class Operation:
    kind: str
    material: MaterialModel
    quantity: Decimal
    operation_id: str
    created_by_id: int
    user_id: Optional[int] = None
    task_id: Optional[int] = None
    reason: str = ""


def apply(db: Session, op: Operation) -> MaterialMovementModel:
    """Ручная операция склада; возвращает проводку по исполнителю (если есть).

    receipt — приход к держателю (на склад или сразу исполнителю);
    issue / return — передача склад → исполнитель / исполнитель → склад;
    write_off — списание у держателя; adjust — инвентаризация: quantity —
    фактический остаток, проводится разница."""
    if op.kind not in MANUAL_KINDS:
        raise StockError("Неизвестная операция", 422)
    if op.kind in (ISSUE, RETURN) and op.user_id is None:
        raise StockError("Выберите исполнителя", 422)
    common = dict(
        material=op.material,
        kind=op.kind,
        operation_id=op.operation_id,
        created_by_id=op.created_by_id,
        task_id=op.task_id,
        reason=op.reason,
    )
    if op.kind == ADJUST:
        delta = op.quantity - balance(db, op.material, op.user_id)
        if delta == 0:
            raise StockError("Остаток уже совпадает с фактическим", 422)
        return post(db, user_id=op.user_id, delta=delta, allow_negative=True, **common)
    if op.kind == RECEIPT:
        return post(db, user_id=op.user_id, delta=op.quantity, **common)
    if op.kind == WRITE_OFF:
        return post(db, user_id=op.user_id, delta=-op.quantity, **common)
    # Передача: сначала уменьшаем источник — нехватка не оставит полпроводки.
    source, target = (None, op.user_id) if op.kind == ISSUE else (op.user_id, None)
    warehouse = {**common, "operation_id": op.operation_id + _WAREHOUSE_SUFFIX}
    if source is None:
        post(db, user_id=None, delta=-op.quantity, **warehouse)
        return post(db, user_id=target, delta=op.quantity, **common)
    row = post(db, user_id=source, delta=-op.quantity, **common)
    post(db, user_id=None, delta=op.quantity, **warehouse)
    return row


# ------------------------------------------------------------------ акты


def _task_postings(
    db: Session, task_id: int, material_id: int, kinds: Iterable[str]
) -> Dict[Optional[int], Decimal]:
    """Списано (положительное число) проводками этих видов по заявке — по держателям."""
    rows = (
        db.query(
            MaterialMovementModel.user_id,
            func.coalesce(func.sum(MaterialMovementModel.quantity), 0),
        )
        .filter(
            MaterialMovementModel.task_id == task_id,
            MaterialMovementModel.material_id == material_id,
            MaterialMovementModel.kind.in_(list(kinds)),
        )
        .group_by(MaterialMovementModel.user_id)
        .all()
    )
    return {user_id: -Decimal(str(total)) for user_id, total in rows}


def _acts_quantity(db: Session, task_id: int, material_id: int) -> Decimal:
    """Сумма количества материала в действующих актах заявки."""
    from app.models.act import ActLineModel
    from app.services.act_service import CANCELLED

    total = (
        db.query(func.coalesce(func.sum(ActLineModel.qty), 0))
        .join(ActModel, ActModel.id == ActLineModel.act_id)
        .filter(
            ActModel.task_id == task_id,
            ActModel.status != CANCELLED,
            ActLineModel.material_id == material_id,
        )
        .scalar()
    )
    return Decimal(str(total))


def _reconcile(
    db: Session,
    act: ActModel,
    material: MaterialModel,
    holder_id: Optional[int],
    created_by_id: int,
    suffix: str,
) -> List[MaterialMovementModel]:
    """Довести списанное актами по заявке до max(0, в актах − списано вручную).

    Считается по заявке целиком, а не по держателю: после переназначения
    заявки материал не списывается второй раз. Недостающее списывается с
    holder_id (исполнитель заявки; None — склад организации), лишнее
    возвращается тем, с кого акты списывали, — начиная с больших сумм."""
    task_id = act.task_id
    manual = sum(
        _task_postings(db, task_id, material.id, [WRITE_OFF]).values(), Decimal(0)
    )
    by_holder = _task_postings(db, task_id, material.id, [ACT, ACT_CANCEL])
    target = max(Decimal(0), _acts_quantity(db, task_id, material.id) - manual)
    delta = target - sum(by_holder.values(), Decimal(0))
    if delta == 0:
        return []

    def posting(user_id: Optional[int], amount: Decimal) -> MaterialMovementModel:
        holder_key = "wh" if user_id is None else user_id
        return post(
            db,
            material=material,
            user_id=user_id,
            delta=-amount,
            kind=ACT if amount > 0 else ACT_CANCEL,
            operation_id=f"act:{act.id}:{material.id}:{holder_key}:{suffix}",
            created_by_id=created_by_id,
            task_id=task_id,
            reason=f"Акт №{act.number}",
            allow_negative=True,
        )

    if delta > 0:
        return [posting(holder_id, delta)]
    rows, excess = [], -delta
    for user_id, written in sorted(by_holder.items(), key=lambda item: -item[1]):
        if excess <= 0 or written <= 0:
            break
        amount = min(written, excess)
        rows.append(posting(user_id, -amount))
        excess -= amount
    return rows


def _act_materials(db: Session, act: ActModel) -> List[MaterialModel]:
    ids = {line.material_id for line in act.lines if line.material_id}
    if not ids:
        return []
    return (
        db.query(MaterialModel)
        .filter(
            MaterialModel.id.in_(ids),
            MaterialModel.organization_id == act.organization_id,
        )
        .all()
    )


def write_off_for_act(
    db: Session, act: ActModel, task: TaskModel, user: UserModel
) -> List[str]:
    """Досписать материалы акта у исполнителя заявки; вернуть строки отчёта.

    Без исполнителя — со склада организации, а не с того, кто оформил акт."""
    if act.task_id is None:
        return []
    db.flush()
    report = []
    for material in _act_materials(db, act):
        rows = _reconcile(db, act, material, task.assigned_user_id, user.id, "w")
        written = sum((-row.quantity for row in rows), Decimal(0))
        if written > 0:
            report.append(f"{material.name} {written.normalize()}")
    return report


def return_for_cancelled_act(db: Session, act: ActModel, user: UserModel) -> None:
    """Аннулирование акта: вернуть держателям то, что акты досписали сверх нужного."""
    if act.task_id is None:
        return
    db.flush()
    task = db.get(TaskModel, act.task_id)
    holder_id = task.assigned_user_id if task else None
    for material in _act_materials(db, act):
        _reconcile(db, act, material, holder_id, user.id, "r")


# ---------------------------------------------------------------- обороты


def month_bounds(month: str) -> Tuple[datetime, datetime]:
    """Границы месяца ГГГГ-ММ в бизнес-поясе как наивное UTC."""
    first = date.fromisoformat(f"{month}-01")
    following = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    tz = business_tz()
    return (
        to_naive_utc(datetime.combine(first, time.min, tz)),
        to_naive_utc(datetime.combine(following, time.min, tz)),
    )


@dataclass
class TurnoverRow:
    user_id: Optional[int]
    holder: str
    material_id: int
    material: str
    unit: str
    unit_cost: Decimal
    opening: Decimal = Decimal(0)
    received: Decimal = Decimal(0)
    used: Decimal = Decimal(0)
    transferred: Decimal = Decimal(0)
    other: Decimal = Decimal(0)
    closing: Decimal = Decimal(0)
    cost: Decimal = field(default=Decimal(0))


def _classify(row: TurnoverRow, kind: str, has_task: bool, qty: Decimal) -> None:
    if kind in (ACT, ACT_CANCEL) or (kind == WRITE_OFF and has_task):
        row.used -= qty
    elif kind in (ISSUE, RETURN) and qty < 0:
        row.transferred -= qty
    elif kind in (RECEIPT, ISSUE, RETURN):
        row.received += qty
    else:
        row.other -= qty


def turnover(
    db: Session, organization_id: Optional[int], month: str
) -> List[TurnoverRow]:
    """Обороты за месяц по держателям и материалам организации."""
    start, end = month_bounds(month)
    base = db.query(MaterialMovementModel).join(MaterialModel)
    if organization_id is not None:
        base = base.filter(MaterialModel.organization_id == organization_id)
    m = MaterialMovementModel
    has_task = m.task_id.isnot(None)
    opening = (
        base.filter(m.created_at < start)
        .with_entities(m.user_id, m.material_id, func.sum(m.quantity))
        .group_by(m.user_id, m.material_id)
        .all()
    )
    inside = (
        base.filter(m.created_at >= start, m.created_at < end)
        .with_entities(
            m.user_id,
            m.material_id,
            m.kind,
            has_task,
            func.sum(m.quantity),
        )
        .group_by(m.user_id, m.material_id, m.kind, has_task)
        .all()
    )
    keys = {(u, mat) for u, mat, _ in opening} | {(u, mat) for u, mat, *_ in inside}
    if not keys:
        return []
    materials = {
        row.id: row
        for row in db.query(MaterialModel).filter(
            MaterialModel.id.in_({mat for _, mat in keys})
        )
    }
    user_ids = {u for u, _ in keys if u is not None}
    users = {
        row.id: (row.full_name or row.username)
        for row in db.query(UserModel).filter(UserModel.id.in_(user_ids))
    }
    rows: Dict[Tuple[Optional[int], int], TurnoverRow] = {}
    for user_id, material_id in keys:
        material = materials[material_id]
        rows[(user_id, material_id)] = TurnoverRow(
            user_id=user_id,
            holder="Склад" if user_id is None else users.get(user_id, f"#{user_id}"),
            material_id=material_id,
            material=material.name,
            unit=material.unit,
            unit_cost=Decimal(material.unit_cost or 0),
        )
    for user_id, material_id, total in opening:
        rows[(user_id, material_id)].opening = Decimal(str(total or 0))
    for user_id, material_id, kind, with_task, total in inside:
        _classify(
            rows[(user_id, material_id)], kind, bool(with_task), Decimal(str(total))
        )
    for row in rows.values():
        row.closing = (
            row.opening + row.received - row.used - row.transferred - row.other
        )
        row.cost = money(row.closing * row.unit_cost)
    return sorted(
        rows.values(),
        key=lambda r: (r.user_id is not None, r.holder.lower(), r.material.lower()),
    )


def turnover_workbook(rows: List[TurnoverRow], month: str) -> bytes:
    from openpyxl import Workbook

    from app.services.act_reports import _style_header

    wb = Workbook()
    ws = wb.active
    ws.title = f"Обороты {month}"
    headers = [
        ("Держатель", 26),
        ("Материал", 32),
        ("Ед.", 8),
        ("На начало", 12),
        ("Получено", 12),
        ("На заявки", 12),
        ("Передано", 12),
        ("Списано / инвент.", 14),
        ("На конец", 12),
        ("Цена", 12),
        ("Сумма на конец", 16),
    ]
    ws.append([title for title, _ in headers])
    _style_header(ws, [width for _, width in headers])
    for row in rows:
        ws.append(
            [
                row.holder,
                row.material,
                row.unit,
                float(row.opening),
                float(row.received),
                float(row.used),
                float(row.transferred),
                float(row.other),
                float(row.closing),
                float(row.unit_cost),
                float(row.cost),
            ]
        )
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
