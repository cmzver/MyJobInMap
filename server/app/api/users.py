"""
Users API
=========
Read-only эндпоинты пользователей для всех аутентифицированных клиентов:
список исполнителей и личная статистика. Управление пользователями (CRUD)
живёт в /api/admin/users (см. admin_users.py) — единственная реализация.
"""

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel, get_db
from app.schemas import UserResponse
from app.services import get_current_user_required
from app.services.tenant_filter import TenantFilter
from app.utils import user_list_to_responses

router = APIRouter(prefix="/api/users", tags=["Users"])


class UserStatsResponse(BaseModel):
    """Статистика пользователя"""

    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    completion_rate: float
    avg_completion_hours: float | None
    tasks_this_week: int
    tasks_this_month: int
    streak_days: int  # Дни подряд с выполненными заявками


@router.get("", response_model=List[UserResponse])
async def get_users(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user_required),
):
    """Получить список пользователей (для назначения исполнителей)"""
    tenant = TenantFilter(current_user)
    users = (
        tenant.apply(db.query(UserModel), UserModel)
        .filter(UserModel.is_active == True)
        .all()
    )
    return user_list_to_responses(users)


@router.get("/me/stats", response_model=UserStatsResponse)
async def get_my_stats(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user_required),
):
    """Получить статистику текущего пользователя"""
    user_id = current_user.id
    tenant = TenantFilter(current_user)

    def _as_utc(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    # Все задачи пользователя
    all_tasks = (
        tenant.apply(db.query(TaskModel), TaskModel)
        .filter(TaskModel.assigned_user_id == user_id)
        .all()
    )

    total_tasks = len(all_tasks)
    completed_tasks = sum(1 for t in all_tasks if t.status == "DONE")
    in_progress_tasks = sum(1 for t in all_tasks if t.status == "IN_PROGRESS")

    # Процент выполнения
    completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0

    # Среднее время выполнения (в часах)
    completed_with_time = [
        t for t in all_tasks if t.status == "DONE" and t.completed_at and t.created_at
    ]

    avg_completion_hours = None
    if completed_with_time:
        total_hours = 0
        for t in completed_with_time:
            created = _as_utc(t.created_at)
            completed = _as_utc(t.completed_at)
            if created is None or completed is None:
                continue
            diff = completed - created
            total_hours += diff.total_seconds() / 3600
        avg_completion_hours = round(total_hours / len(completed_with_time), 1)

    # Задачи за эту неделю
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    tasks_this_week = sum(
        1
        for t in all_tasks
        if (created_at := _as_utc(t.created_at)) and created_at >= week_ago
    )

    # Задачи за этот месяц
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    tasks_this_month = sum(
        1
        for t in all_tasks
        if (created_at := _as_utc(t.created_at)) and created_at >= month_ago
    )

    # Серия дней с выполненными заявками
    streak_days = 0
    today = datetime.now(timezone.utc).date()
    for i in range(365):  # Максимум год назад
        check_date = today - timedelta(days=i)
        has_completed = any(
            t.completed_at and t.completed_at.date() == check_date
            for t in all_tasks
            if t.status == "DONE"
        )
        if has_completed:
            streak_days += 1
        elif i > 0:  # Пропускаем сегодня, если ещё нет выполненных
            break

    return UserStatsResponse(
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        in_progress_tasks=in_progress_tasks,
        completion_rate=round(completion_rate, 1),
        avg_completion_hours=avg_completion_hours,
        tasks_this_week=tasks_this_week,
        tasks_this_month=tasks_this_month,
        streak_days=streak_days,
    )
