"""
Регламентное ТО на уровне портфеля (фаза 5c): массовые регламенты, сетка
«регламент × месяц» и отчёт выполнения за месяц.

Прошлое и текущее берётся из созданных заявок ТО (``maintenance_occurrences``),
будущее — прогноз по расписанию от ``next_date`` (заявки на него ещё не созданы).
"""

from __future__ import annotations

import io
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime
from typing import Dict, List, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.models import AddressModel, CounterpartyModel, TaskModel, UserModel
from app.models.operations import MaintenanceOccurrenceModel, MaintenancePlanModel
from app.services.business_time import business_tz, format_local
from app.services.maintenance_service import following_date
from app.services.tenant_filter import TenantFilter

OPEN_STATUSES = ("NEW", "IN_PROGRESS")
MAX_MONTHS = 12
# Прогноз за горизонт: даже ежедневный регламент на год — 366 шагов
_FORECAST_STEPS = 400

STATUS_LABELS = {
    "done": "Выполнено",
    "open": "В работе",
    "overdue": "Просрочено",
    "cancelled": "Отменено",
}


def add_months(first: date, count: int) -> date:
    index = first.year * 12 + first.month - 1 + count
    return date(index // 12, index % 12 + 1, 1)


def month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def _user_name(user: Optional[UserModel]) -> Optional[str]:
    if user is None:
        return None
    return user.full_name or user.username


def occurrence_status(status: Optional[str], scheduled: date, today: date) -> str:
    if status is None or status == "CANCELLED":
        # Заявку удалили или отменили — выезд не состоялся
        return "cancelled"
    if status == "DONE":
        return "done"
    return "overdue" if scheduled < today else "open"


def _plans(
    db: Session,
    user: UserModel,
    counterparty_id: Optional[int],
    assigned_user_id: Optional[int],
):
    query = (
        TenantFilter(user)
        .apply(db.query(MaintenancePlanModel), MaintenancePlanModel)
        .join(AddressModel, AddressModel.id == MaintenancePlanModel.address_id)
    )
    if counterparty_id is not None:
        query = query.filter(AddressModel.counterparty_id == counterparty_id)
    if assigned_user_id is not None:
        query = query.filter(MaintenancePlanModel.assigned_user_id == assigned_user_id)
    return query.order_by(AddressModel.address, MaintenancePlanModel.title).all()


def _names(db: Session, plans: List[MaintenancePlanModel]):
    address_ids = {plan.address_id for plan in plans}
    addresses = {
        address.id: address
        for address in db.query(AddressModel).filter(AddressModel.id.in_(address_ids))
    }
    counterparty_ids = {
        address.counterparty_id
        for address in addresses.values()
        if address.counterparty_id
    }
    counterparties = {
        row.id: row.name
        for row in db.query(CounterpartyModel).filter(
            CounterpartyModel.id.in_(counterparty_ids)
        )
    }
    user_ids = {plan.assigned_user_id for plan in plans if plan.assigned_user_id}
    users = {
        row.id: _user_name(row)
        for row in db.query(UserModel).filter(UserModel.id.in_(user_ids))
    }
    return addresses, counterparties, users


def schedule(
    db: Session,
    user: UserModel,
    first_month: date,
    months: int,
    counterparty_id: Optional[int] = None,
    assigned_user_id: Optional[int] = None,
    today: Optional[date] = None,
) -> dict:
    today = today or datetime.now(business_tz()).date()
    keys = [month_key(add_months(first_month, index)) for index in range(months)]
    range_start = first_month
    last_month = add_months(first_month, months - 1)
    range_end = last_month.replace(day=monthrange(last_month.year, last_month.month)[1])

    plans = _plans(db, user, counterparty_id, assigned_user_id)
    addresses, counterparties, users = _names(db, plans)
    cells: Dict[int, Dict[str, Dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(int))
    )

    plan_ids = [plan.id for plan in plans]
    if plan_ids:
        rows = (
            db.query(
                MaintenanceOccurrenceModel.plan_id,
                MaintenanceOccurrenceModel.scheduled_date,
                TaskModel.status,
            )
            .outerjoin(TaskModel, TaskModel.id == MaintenanceOccurrenceModel.task_id)
            .filter(
                MaintenanceOccurrenceModel.plan_id.in_(plan_ids),
                MaintenanceOccurrenceModel.scheduled_date >= range_start,
                MaintenanceOccurrenceModel.scheduled_date <= range_end,
            )
            .all()
        )
        for plan_id, scheduled, status in rows:
            key = month_key(scheduled)
            cells[plan_id][key][occurrence_status(status, scheduled, today)] += 1

    for plan in plans:
        if not plan.enabled:
            continue
        day = plan.next_date
        for _ in range(_FORECAST_STEPS):
            if day > range_end or (plan.end_date and day > plan.end_date):
                break
            if day >= range_start and day.isoformat() not in (
                plan.excluded_dates or []
            ):
                cells[plan.id][month_key(day)]["planned"] += 1
            day = following_date(plan, day)

    totals: Dict[str, Dict[str, int]] = {key: defaultdict(int) for key in keys}
    result_rows = []
    for plan in plans:
        address = addresses.get(plan.address_id)
        row_cells = []
        for key in keys:
            counts = cells[plan.id][key]
            for status, value in counts.items():
                totals[key][status] += value
            row_cells.append({"month": key, **counts})
        result_rows.append(
            {
                "plan_id": plan.id,
                "title": plan.title,
                "address_id": plan.address_id,
                "address": address.address if address else f"#{plan.address_id}",
                "counterparty_id": address.counterparty_id if address else None,
                "counterparty_name": (
                    counterparties.get(address.counterparty_id) if address else None
                ),
                "assigned_user_name": users.get(plan.assigned_user_id),
                "frequency": plan.frequency,
                "interval": plan.interval,
                "next_date": plan.next_date,
                "enabled": plan.enabled,
                "cells": row_cells,
            }
        )
    return {
        "months": keys,
        "rows": result_rows,
        "totals": [{"month": key, **totals[key]} for key in keys],
    }


def bulk_create(
    db: Session,
    user: UserModel,
    fields: dict,
    addresses: List[AddressModel],
) -> tuple[int, List[str]]:
    """Регламент на каждый объект; где регламент с тем же названием уже есть —
    пропускаем (повторный запуск не плодит дубли)."""
    existing = {
        address_id
        for (address_id,) in db.query(MaintenancePlanModel.address_id).filter(
            MaintenancePlanModel.address_id.in_([address.id for address in addresses]),
            MaintenancePlanModel.title == fields["title"],
        )
    }
    created, skipped = 0, []
    for address in addresses:
        if address.id in existing:
            skipped.append(address.address)
            continue
        db.add(
            MaintenancePlanModel(
                **fields,
                address_id=address.id,
                organization_id=user.organization_id,
                created_by_id=user.id,
                next_date=fields["start_date"],
            )
        )
        created += 1
    db.commit()
    return created, skipped


def _style_header(ws, widths: List[int]) -> None:
    fill = PatternFill("solid", fgColor="F3F4F6")
    for index, width in enumerate(widths, start=1):
        cell = ws.cell(row=1, column=index)
        cell.font = Font(bold=True)
        cell.fill = fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(index)].width = width
    ws.freeze_panes = "A2"


def month_report(
    db: Session,
    user: UserModel,
    month: str,
    counterparty_id: Optional[int] = None,
    today: Optional[date] = None,
) -> bytes:
    """Отчёт выполнения ТО за месяц: каждый выезд и сводка по объектам."""
    today = today or datetime.now(business_tz()).date()
    first = date.fromisoformat(f"{month}-01")
    last = first.replace(day=monthrange(first.year, first.month)[1])
    plans = {plan.id: plan for plan in _plans(db, user, counterparty_id, None)}
    addresses, counterparties, users = _names(db, list(plans.values()))
    rows = (
        db.query(MaintenanceOccurrenceModel, TaskModel)
        .outerjoin(TaskModel, TaskModel.id == MaintenanceOccurrenceModel.task_id)
        .filter(
            MaintenanceOccurrenceModel.plan_id.in_(list(plans) or [0]),
            MaintenanceOccurrenceModel.scheduled_date >= first,
            MaintenanceOccurrenceModel.scheduled_date <= last,
        )
        .order_by(MaintenanceOccurrenceModel.scheduled_date)
        .all()
    )
    executors = {
        row.id: _user_name(row)
        for row in db.query(UserModel).filter(
            UserModel.id.in_(
                {
                    task.assigned_user_id
                    for _, task in rows
                    if task and task.assigned_user_id
                }
            )
        )
    }

    wb = Workbook()
    ws = wb.active
    ws.title = "Выезды"
    headers = [
        ("Дата по плану", 13),
        ("Регламент", 30),
        ("Адрес", 40),
        ("Контрагент", 24),
        ("Заявка", 11),
        ("Исполнитель", 22),
        ("Статус", 13),
        ("Выполнено", 17),
    ]
    ws.append([title for title, _ in headers])
    _style_header(ws, [width for _, width in headers])
    summary: Dict[int, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for occurrence, task in rows:
        plan = plans[occurrence.plan_id]
        address = addresses.get(plan.address_id)
        status = occurrence_status(
            task.status if task else None, occurrence.scheduled_date, today
        )
        summary[plan.address_id][status] += 1
        completed = ""
        if task and task.completed_at:
            completed = format_local(task.completed_at)
        ws.append(
            [
                occurrence.scheduled_date.strftime("%d.%m.%Y"),
                plan.title,
                address.address if address else "",
                counterparties.get(address.counterparty_id) if address else "",
                (task.task_number or f"Z-{task.id:05d}") if task else "",
                executors.get(task.assigned_user_id) if task else "",
                STATUS_LABELS[status],
                completed,
            ]
        )

    totals = wb.create_sheet("По объектам")
    total_headers = [
        ("Адрес", 40),
        ("Контрагент", 24),
        ("Выездов по плану", 12),
        ("Выполнено", 11),
        ("В работе", 10),
        ("Просрочено", 11),
        ("Отменено", 10),
        ("Выполнение, %", 12),
    ]
    totals.append([title for title, _ in total_headers])
    _style_header(totals, [width for _, width in total_headers])
    for address_id, counts in sorted(
        summary.items(),
        key=lambda item: addresses[item[0]].address if item[0] in addresses else "",
    ):
        address = addresses.get(address_id)
        planned = sum(counts.values())
        totals.append(
            [
                address.address if address else f"#{address_id}",
                counterparties.get(address.counterparty_id) if address else "",
                planned,
                counts["done"],
                counts["open"],
                counts["overdue"],
                counts["cancelled"],
                round(counts["done"] * 100 / planned) if planned else 0,
            ]
        )

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
