"""
SLA Service
============
Расчёт метрик SLA (Service Level Agreement).

Метрики:
- % заявок выполненных в срок (in-SLA)
- Среднее время выполнения
- Процент просроченных
- Тренды по периодам
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, case, extract, func
from sqlalchemy.orm import Session

from app.models import TaskModel, TaskStatus, UserModel
from app.services.analytics_periods import resolve_analytics_period
from app.services.tenant_filter import TenantFilter

logger = logging.getLogger(__name__)

# SLA нормативы по приоритету (в часах)
DEFAULT_SLA_HOURS = {
    "PLANNED": 168,  # 7 дней
    "CURRENT": 48,  # 2 дня
    "URGENT": 8,  # 8 часов
    "EMERGENCY": 4,  # 4 часа
    "1": 168,
    "2": 48,
    "3": 8,
    "4": 4,
}


def _get_sla_hours(priority: Optional[str]) -> int:
    """Получить норматив SLA для приоритета."""
    if not priority:
        return 48  # default
    return DEFAULT_SLA_HOURS.get(str(priority).upper(), 48)


def get_sla_metrics(
    db: Session,
    period: str = "month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    worker_id: Optional[int] = None,
    tenant_user: Optional[UserModel] = None,
) -> dict:
    """
    Получить основные метрики SLA.

    Returns:
        {
            "period": {"start": ..., "end": ..., "days": ...},
            "overview": {
                "total_tasks": int,
                "completed_tasks": int,
                "in_progress_tasks": int,
                "overdue_tasks": int,
                "completion_rate": float,
                "sla_compliance_rate": float,
            },
            "timing": {
                "avg_completion_hours": float,
                "min_completion_hours": float,
                "max_completion_hours": float,
                "median_completion_hours": float,
            },
            "by_priority": [...],
            "trends": [...],
        }
    """
    start, end, period_days = resolve_analytics_period(period, date_from, date_to)
    tenant = TenantFilter(tenant_user) if tenant_user is not None else None

    # === Основные метрики ===
    base_query = db.query(TaskModel)
    if start is not None:
        base_query = base_query.filter(TaskModel.created_at >= start)
    if end is not None:
        base_query = base_query.filter(TaskModel.created_at <= end)
    if worker_id is not None:
        base_query = base_query.filter(TaskModel.assigned_user_id == worker_id)
    if tenant is not None:
        base_query = tenant.apply(base_query, TaskModel)

    total_tasks = base_query.count()
    completed_tasks = base_query.filter(
        TaskModel.status == TaskStatus.DONE.value
    ).count()
    in_progress_tasks = base_query.filter(
        TaskModel.status == TaskStatus.IN_PROGRESS.value
    ).count()
    cancelled_tasks = base_query.filter(
        TaskModel.status == TaskStatus.CANCELLED.value
    ).count()
    new_tasks = base_query.filter(TaskModel.status == TaskStatus.NEW.value).count()

    completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0

    # === Просроченные заявки ===
    now = datetime.now(timezone.utc)
    overdue_tasks = 0
    in_sla_tasks = 0

    # Загружаем завершённые заявки для расчёта SLA compliance
    completed = base_query.filter(
        TaskModel.status == TaskStatus.DONE.value,
        TaskModel.completed_at.isnot(None),
    ).all()

    completion_hours_list = []

    for task in completed:
        created = task.created_at
        done = task.completed_at
        if created and done:
            # Если created/done - naive datetime, добавляем UTC
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if done.tzinfo is None:
                done = done.replace(tzinfo=timezone.utc)

            hours = (done - created).total_seconds() / 3600
            completion_hours_list.append(hours)

            sla_limit = _get_sla_hours(task.priority)
            if hours <= sla_limit:
                in_sla_tasks += 1
            else:
                overdue_tasks += 1

    # Активные заявки, которые уже просрочены
    active = base_query.filter(
        TaskModel.status.in_([TaskStatus.NEW.value, TaskStatus.IN_PROGRESS.value])
    ).all()

    active_overdue = 0
    for task in active:
        created = task.created_at
        if created:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            hours_elapsed = (now - created).total_seconds() / 3600
            sla_limit = _get_sla_hours(task.priority)
            if hours_elapsed > sla_limit:
                active_overdue += 1

    sla_compliance_rate = (in_sla_tasks / len(completed) * 100) if completed else 0

    # === Timing stats ===
    if completion_hours_list:
        completion_hours_list.sort()
        avg_hours = sum(completion_hours_list) / len(completion_hours_list)
        min_hours = completion_hours_list[0]
        max_hours = completion_hours_list[-1]
        mid = len(completion_hours_list) // 2
        if len(completion_hours_list) % 2 == 0 and len(completion_hours_list) > 1:
            median_hours = (
                completion_hours_list[mid - 1] + completion_hours_list[mid]
            ) / 2
        else:
            median_hours = completion_hours_list[mid]
    else:
        avg_hours = min_hours = max_hours = median_hours = 0

    # === По приоритету ===
    priority_labels = {
        "PLANNED": "Плановая",
        "1": "Плановая",
        "CURRENT": "Текущая",
        "2": "Текущая",
        "URGENT": "Срочная",
        "3": "Срочная",
        "EMERGENCY": "Аварийная",
        "4": "Аварийная",
    }

    by_priority = []
    for priority_key in ["PLANNED", "CURRENT", "URGENT", "EMERGENCY"]:
        rank_key = {"PLANNED": "1", "CURRENT": "2", "URGENT": "3", "EMERGENCY": "4"}[
            priority_key
        ]

        priority_total = base_query.filter(
            TaskModel.priority.in_([priority_key, rank_key])
        ).count()

        priority_completed = base_query.filter(
            TaskModel.status == TaskStatus.DONE.value,
            TaskModel.priority.in_([priority_key, rank_key]),
        ).count()

        # SLA compliance для этого приоритета
        priority_in_sla = 0
        for task in completed:
            if str(task.priority).upper() in (priority_key, rank_key):
                created = task.created_at
                done = task.completed_at
                if created and done:
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    if done.tzinfo is None:
                        done = done.replace(tzinfo=timezone.utc)
                    hours = (done - created).total_seconds() / 3600
                    if hours <= _get_sla_hours(priority_key):
                        priority_in_sla += 1

        sla_rate = (
            (priority_in_sla / priority_completed * 100)
            if priority_completed > 0
            else 0
        )

        by_priority.append(
            {
                "priority": priority_key,
                "label": priority_labels.get(priority_key, priority_key),
                "total": priority_total,
                "completed": priority_completed,
                "sla_hours": _get_sla_hours(priority_key),
                "sla_compliance_rate": round(sla_rate, 1),
            }
        )

    # === Тренды (по дням/неделям) ===
    period_start = start
    period_end = end
    resolved_period_days = period_days or 0
    has_period_window = period_start is not None and period_end is not None

    if not has_period_window:
        dated_points = []
        for task in base_query.order_by(TaskModel.created_at.asc()).all():
            if task.created_at:
                dated_points.append(task.created_at)
            if task.completed_at:
                dated_points.append(task.completed_at)
        if dated_points:
            period_start = min(dated_points)
            period_end = max(dated_points)
            if period_start.tzinfo is None:
                period_start = period_start.replace(tzinfo=timezone.utc)
            if period_end.tzinfo is None:
                period_end = period_end.replace(tzinfo=timezone.utc)
            resolved_period_days = (period_end.date() - period_start.date()).days + 1
            has_period_window = True
        else:
            fallback_now = datetime.now(timezone.utc)
            period_start = fallback_now
            period_end = fallback_now

    trends = (
        _compute_trends(
            db,
            period_start,
            period_end,
            resolved_period_days,
            worker_id=worker_id,
            tenant_user=tenant_user,
        )
        if has_period_window and resolved_period_days > 0
        else []
    )

    # === По исполнителям ===
    by_worker = (
        _compute_worker_sla(
            db,
            period_start,
            period_end,
            completed,
            worker_id=worker_id,
            tenant_user=tenant_user,
        )
        if has_period_window and resolved_period_days > 0
        else []
    )

    return {
        "period": {
            "start": period_start.isoformat(),
            "end": period_end.isoformat(),
            "days": resolved_period_days,
            "label": period,
        },
        "overview": {
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "in_progress_tasks": in_progress_tasks,
            "new_tasks": new_tasks,
            "cancelled_tasks": cancelled_tasks,
            "overdue_tasks": overdue_tasks,
            "active_overdue": active_overdue,
            "completion_rate": round(completion_rate, 1),
            "sla_compliance_rate": round(sla_compliance_rate, 1),
        },
        "timing": {
            "avg_completion_hours": round(avg_hours, 1),
            "min_completion_hours": round(min_hours, 1),
            "max_completion_hours": round(max_hours, 1),
            "median_completion_hours": round(median_hours, 1),
        },
        "by_priority": by_priority,
        "by_worker": by_worker,
        "trends": trends,
    }


def _compute_trends(
    db: Session,
    start: datetime,
    end: datetime,
    period_days: int,
    worker_id: Optional[int] = None,
    tenant_user: Optional[UserModel] = None,
) -> list:
    """Вычислить тренды по дням или неделям."""
    trends = []
    tenant = TenantFilter(tenant_user) if tenant_user is not None else None

    if period_days <= 31:
        # По дням
        current = start
        while current <= end:
            day_start = current.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)

            created_query = db.query(TaskModel).filter(
                TaskModel.created_at >= day_start,
                TaskModel.created_at < day_end,
            )
            if worker_id is not None:
                created_query = created_query.filter(
                    TaskModel.assigned_user_id == worker_id
                )
            if tenant is not None:
                created_query = tenant.apply(created_query, TaskModel)
            created = created_query.count()

            completed_query = db.query(TaskModel).filter(
                TaskModel.completed_at >= day_start,
                TaskModel.completed_at < day_end,
                TaskModel.status == TaskStatus.DONE.value,
            )
            if worker_id is not None:
                completed_query = completed_query.filter(
                    TaskModel.assigned_user_id == worker_id
                )
            if tenant is not None:
                completed_query = tenant.apply(completed_query, TaskModel)
            completed_count = completed_query.count()

            trends.append(
                {
                    "date": day_start.strftime("%Y-%m-%d"),
                    "created": created,
                    "completed": completed_count,
                }
            )

            current += timedelta(days=1)
    else:
        # По неделям
        current = start
        while current <= end:
            week_end = current + timedelta(days=7)

            created_query = db.query(TaskModel).filter(
                TaskModel.created_at >= current,
                TaskModel.created_at < week_end,
            )
            if worker_id is not None:
                created_query = created_query.filter(
                    TaskModel.assigned_user_id == worker_id
                )
            if tenant is not None:
                created_query = tenant.apply(created_query, TaskModel)
            created = created_query.count()

            completed_query = db.query(TaskModel).filter(
                TaskModel.completed_at >= current,
                TaskModel.completed_at < week_end,
                TaskModel.status == TaskStatus.DONE.value,
            )
            if worker_id is not None:
                completed_query = completed_query.filter(
                    TaskModel.assigned_user_id == worker_id
                )
            if tenant is not None:
                completed_query = tenant.apply(completed_query, TaskModel)
            completed_count = completed_query.count()

            trends.append(
                {
                    "date": current.strftime("%Y-%m-%d"),
                    "created": created,
                    "completed": completed_count,
                }
            )

            current = week_end

    return trends


def _compute_worker_sla(
    db: Session,
    start: datetime,
    end: datetime,
    completed_tasks: list,
    worker_id: Optional[int] = None,
    tenant_user: Optional[UserModel] = None,
) -> list:
    """Вычислить SLA метрики по исполнителям."""
    tenant = TenantFilter(tenant_user) if tenant_user is not None else None
    workers_query = db.query(UserModel).filter(UserModel.is_active == True)
    if worker_id is not None:
        workers_query = workers_query.filter(UserModel.id == worker_id)
    if tenant is not None:
        workers_query = tenant.apply(workers_query, UserModel)
    workers = workers_query.all()

    by_worker = []
    for worker in workers:
        total_query = db.query(TaskModel).filter(
            TaskModel.assigned_user_id == worker.id,
            TaskModel.created_at >= start,
            TaskModel.created_at <= end,
        )
        if tenant is not None:
            total_query = tenant.apply(total_query, TaskModel)
        total = total_query.count()

        if total == 0:
            continue

        done_query = db.query(TaskModel).filter(
            TaskModel.assigned_user_id == worker.id,
            TaskModel.status == TaskStatus.DONE.value,
            TaskModel.created_at >= start,
            TaskModel.created_at <= end,
        )
        if tenant is not None:
            done_query = tenant.apply(done_query, TaskModel)
        done = done_query.count()

        # SLA compliance
        worker_tasks = [t for t in completed_tasks if t.assigned_user_id == worker.id]
        in_sla = 0
        total_hours = 0
        for task in worker_tasks:
            created = task.created_at
            completed_at = task.completed_at
            if created and completed_at:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if completed_at.tzinfo is None:
                    completed_at = completed_at.replace(tzinfo=timezone.utc)
                hours = (completed_at - created).total_seconds() / 3600
                total_hours += hours
                if hours <= _get_sla_hours(task.priority):
                    in_sla += 1

        avg_hours = (total_hours / len(worker_tasks)) if worker_tasks else 0
        sla_rate = (in_sla / len(worker_tasks) * 100) if worker_tasks else 0

        by_worker.append(
            {
                "user_id": worker.id,
                "user_name": worker.full_name or worker.username,
                "total_tasks": total,
                "completed_tasks": done,
                "completion_rate": round((done / total * 100) if total > 0 else 0, 1),
                "sla_compliance_rate": round(sla_rate, 1),
                "avg_completion_hours": round(avg_hours, 1),
            }
        )

    # Сортировка по SLA compliance (лучшие сверху)
    by_worker.sort(key=lambda w: w["sla_compliance_rate"], reverse=True)

    return by_worker
