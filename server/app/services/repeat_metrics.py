"""
Repeat Metrics
==============
Аналитика повторных заявок за период: доля возвратов по мастерам и места
(адреса, системы), где заявок больше всего.

Возврат относится к закрытию исходной заявки: «закрыто за период» и «из них
вернулись» считаются по одним и тем же заявкам, поэтому доля не превышает 100%.
"""

from typing import Any, Dict, List, Optional

from sqlalchemy import case, exists, func
from sqlalchemy.orm import Session, aliased

from app.models import TaskModel, TaskStatus, UserModel
from app.models.address import AddressModel, AddressSystemModel
from app.services.analytics_periods import resolve_analytics_period
from app.services.business_time import to_naive_utc
from app.services.repeat_detector import (
    DUPLICATE,
    RETURN,
    get_repeat_window_days,
)
from app.services.tenant_filter import TenantFilter

TOP_LIMIT = 10


def _rate(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _in_period(query, column, start, end):
    if start is not None:
        query = query.filter(column >= to_naive_utc(start))
    if end is not None:
        query = query.filter(column <= to_naive_utc(end))
    return query


def get_repeat_metrics(
    db: Session,
    tenant_user: UserModel,
    period: str = "month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict[str, Any]:
    start, end, period_days = resolve_analytics_period(period, date_from, date_to)
    tenant = TenantFilter(tenant_user)

    created = _in_period(
        tenant.apply(db.query(TaskModel), TaskModel),
        TaskModel.created_at,
        start,
        end,
    )
    kind_counts = dict(
        created.with_entities(TaskModel.repeat_kind, func.count(TaskModel.id))
        .group_by(TaskModel.repeat_kind)
        .all()
    )

    repeat = aliased(TaskModel)
    returned = exists().where(
        repeat.repeat_of_task_id == TaskModel.id, repeat.repeat_kind == RETURN
    )
    completed = _in_period(
        tenant.apply(db.query(TaskModel), TaskModel).filter(
            TaskModel.status == TaskStatus.DONE.value
        ),
        TaskModel.completed_at,
        start,
        end,
    )
    worker_rows = (
        completed.with_entities(
            TaskModel.assigned_user_id,
            func.count(TaskModel.id),
            func.sum(case((returned, 1), else_=0)),
        )
        .group_by(TaskModel.assigned_user_id)
        .all()
    )
    names = {
        user.id: user.full_name or user.username
        for user in db.query(UserModel).filter(
            UserModel.id.in_([row[0] for row in worker_rows if row[0] is not None])
        )
    }
    by_worker = sorted(
        (
            {
                "user_id": user_id,
                "user_name": names.get(user_id, f"#{user_id}"),
                "completed": total,
                "returned": int(returns or 0),
                "return_rate": _rate(int(returns or 0), total),
            }
            for user_id, total, returns in worker_rows
            if user_id is not None
        ),
        key=lambda row: (-row["returned"], -row["completed"], row["user_name"]),
    )
    completed_total = sum(row[1] for row in worker_rows)
    returned_total = sum(int(row[2] or 0) for row in worker_rows)

    return {
        "period": {
            "start": start.isoformat() if start else "",
            "end": end.isoformat() if end else "",
            "days": period_days or 0,
            "label": period,
        },
        "window_days": get_repeat_window_days(db, tenant_user.organization_id),
        "overview": {
            "created": sum(kind_counts.values()),
            "duplicates": kind_counts.get(DUPLICATE, 0),
            "returns": kind_counts.get(RETURN, 0),
            "completed": completed_total,
            "returned": returned_total,
            "return_rate": _rate(returned_total, completed_total),
        },
        "by_worker": by_worker,
        "top_addresses": _top_addresses(db, created),
        "top_systems": _top_systems(db, created),
    }


def _top_addresses(db: Session, created) -> List[Dict[str, Any]]:
    """Места с наибольшим числом заявок за период (от двух заявок)."""
    rows = (
        created.with_entities(
            TaskModel.address_key,
            TaskModel.address_id,
            TaskModel.raw_address,
            TaskModel.repeat_kind,
        )
        .order_by(TaskModel.created_at.desc())
        .all()
    )
    groups: Dict[str, Dict[str, Any]] = {}
    for key, address_id, raw_address, kind in rows:
        group_key = key or f"raw:{(raw_address or '').strip().lower()}"
        group = groups.setdefault(
            group_key,
            {"label": raw_address or "", "address_id": None, "tasks": 0, "returns": 0},
        )
        group["tasks"] += 1
        group["returns"] += int(kind == RETURN)
        group["address_id"] = group["address_id"] or address_id

    top = sorted(
        (group for group in groups.values() if group["tasks"] > 1),
        key=lambda group: (-group["tasks"], -group["returns"], group["label"]),
    )[:TOP_LIMIT]
    labels = _book_labels(db, [group["address_id"] for group in top])
    for group in top:
        group["label"] = labels.get(group["address_id"]) or group["label"]
    return top


def _book_labels(db: Session, address_ids: List[Optional[int]]) -> Dict[int, str]:
    ids = [address_id for address_id in address_ids if address_id]
    if not ids:
        return {}
    return dict(
        db.query(AddressModel.id, AddressModel.address)
        .filter(AddressModel.id.in_(ids))
        .all()
    )


def _top_systems(db: Session, created) -> List[Dict[str, Any]]:
    rows = (
        created.filter(TaskModel.system_id.isnot(None))
        .with_entities(
            TaskModel.system_id,
            func.count(TaskModel.id),
            func.sum(case((TaskModel.repeat_kind == RETURN, 1), else_=0)),
        )
        .group_by(TaskModel.system_id)
        .order_by(func.count(TaskModel.id).desc())
        .limit(TOP_LIMIT)
        .all()
    )
    systems = {
        system.id: system
        for system in db.query(AddressSystemModel).filter(
            AddressSystemModel.id.in_([row[0] for row in rows])
        )
    }
    labels = _book_labels(db, [system.address_id for system in systems.values()])
    result = []
    for system_id, tasks, returns in rows:
        if tasks < 2:
            continue
        system = systems.get(system_id)
        result.append(
            {
                "system_id": system_id,
                "name": system.name if system else f"Система #{system_id}",
                "address_id": system.address_id if system else None,
                "address": labels.get(system.address_id, "") if system else "",
                "tasks": tasks,
                "returns": int(returns or 0),
            }
        )
    return result
