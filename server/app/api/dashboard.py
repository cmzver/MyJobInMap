"""
Dashboard API
=============
Эндпоинты для дашборда портала.
"""

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import TaskModel, UserModel, get_db
from app.services import get_current_user_required
from app.services.tenant_filter import TenantFilter
from app.utils import normalize_priority_value, priority_rank_expr

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


class DayActivity(BaseModel):
    """Активность за день"""

    date: str
    created: int
    completed: int


class UrgentTask(BaseModel):
    """Срочная заявка"""

    id: int
    title: str
    priority: str
    status: str
    planned_date: str | None
    assignee_name: str | None


class DashboardStatsResponse(BaseModel):
    """Статистика для дашборда"""

    totalTasks: int
    newTasks: int
    inProgressTasks: int
    completedTasks: int
    cancelledTasks: int
    totalWorkers: int
    activeWorkers: int

    model_config = ConfigDict(from_attributes=True)


class DashboardActivityResponse(BaseModel):
    """Активность за последние 7 дней"""

    activity: List[DayActivity]
    urgentTasks: List[UrgentTask]
    todayCreated: int
    todayCompleted: int
    weekCreated: int
    weekCompleted: int


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    period: str = Query(
        "today",
        description="Period: today, week, month (currently unused, returns all tasks)",
    ),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """
    Получить статистику для дашборда

    Показывает текущее состояние всех задач в системе.
    """
    # Получаем ВСЕ задачи (текущее состояние системы)
    tenant = TenantFilter(user)
    tasks = tenant.apply(db.query(TaskModel), TaskModel).all()

    # Статистика по задачам
    total_tasks = len(tasks)
    new_tasks = sum(1 for t in tasks if t.status == "NEW")
    in_progress_tasks = sum(1 for t in tasks if t.status == "IN_PROGRESS")
    completed_tasks = sum(1 for t in tasks if t.status == "DONE")
    cancelled_tasks = sum(1 for t in tasks if t.status == "CANCELLED")

    # Статистика по работникам
    workers_query = tenant.apply(db.query(UserModel), UserModel).filter(
        UserModel.role.in_(["worker", "dispatcher"]), UserModel.is_active == True
    )
    total_workers = workers_query.count()

    # Активные работники - те, у кого есть задачи в работе
    active_workers_query = (
        tenant.apply(db.query(TaskModel.assigned_user_id), TaskModel)
        .filter(
            TaskModel.status == "IN_PROGRESS", TaskModel.assigned_user_id.isnot(None)
        )
        .distinct()
    )
    active_workers = active_workers_query.count()

    return DashboardStatsResponse(
        totalTasks=total_tasks,
        newTasks=new_tasks,
        inProgressTasks=in_progress_tasks,
        completedTasks=completed_tasks,
        cancelledTasks=cancelled_tasks,
        totalWorkers=total_workers,
        activeWorkers=active_workers,
    )


@router.get("/activity", response_model=DashboardActivityResponse)
async def get_dashboard_activity(
    db: Session = Depends(get_db), user: UserModel = Depends(get_current_user_required)
):
    """
    Получить активность за последние 7 дней и срочные заявки
    """
    today = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_ago = today - timedelta(days=7)
    tenant = TenantFilter(user)

    # Активность по дням за последние 7 дней
    activity = []
    for i in range(7):
        day_start = today - timedelta(days=6 - i)
        day_end = day_start + timedelta(days=1)

        # Созданные заявки за день
        created = (
            tenant.apply(db.query(func.count(TaskModel.id)), TaskModel)
            .filter(TaskModel.created_at >= day_start, TaskModel.created_at < day_end)
            .scalar()
            or 0
        )

        # Завершённые заявки за день
        completed = (
            tenant.apply(db.query(func.count(TaskModel.id)), TaskModel)
            .filter(
                TaskModel.completed_at >= day_start, TaskModel.completed_at < day_end
            )
            .scalar()
            or 0
        )

        activity.append(
            DayActivity(
                date=day_start.strftime("%Y-%m-%d"),
                created=created,
                completed=completed,
            )
        )

    # Срочные заявки (EMERGENCY и URGENT) — с joinedload вместо N+1 запросов
    urgent_tasks_query = (
        tenant.apply(db.query(TaskModel), TaskModel)
        .options(joinedload(TaskModel.assigned_user))
        .filter(
            TaskModel.priority.in_(["EMERGENCY", "URGENT", "4", "3", 4, 3]),
            TaskModel.status.in_(["NEW", "IN_PROGRESS"]),
        )
        .order_by(priority_rank_expr(TaskModel.priority).desc(), TaskModel.created_at)
        .limit(5)
        .all()
    )

    urgent_tasks = []
    for task in urgent_tasks_query:
        assignee_name = None
        if task.assigned_user:
            assignee_name = task.assigned_user.full_name or task.assigned_user.username

        urgent_tasks.append(
            UrgentTask(
                id=task.id,
                title=task.title,
                priority=normalize_priority_value(task.priority, default="CURRENT"),
                status=task.status,
                planned_date=(
                    task.planned_date.isoformat() if task.planned_date else None
                ),
                assignee_name=assignee_name,
            )
        )

    # Статистика за сегодня
    tomorrow = today + timedelta(days=1)
    today_created = (
        tenant.apply(db.query(func.count(TaskModel.id)), TaskModel)
        .filter(TaskModel.created_at >= today, TaskModel.created_at < tomorrow)
        .scalar()
        or 0
    )

    today_completed = (
        tenant.apply(db.query(func.count(TaskModel.id)), TaskModel)
        .filter(TaskModel.completed_at >= today, TaskModel.completed_at < tomorrow)
        .scalar()
        or 0
    )

    # Статистика за неделю
    week_created = (
        tenant.apply(db.query(func.count(TaskModel.id)), TaskModel)
        .filter(TaskModel.created_at >= week_ago)
        .scalar()
        or 0
    )

    week_completed = (
        tenant.apply(db.query(func.count(TaskModel.id)), TaskModel)
        .filter(TaskModel.completed_at >= week_ago)
        .scalar()
        or 0
    )

    return DashboardActivityResponse(
        activity=activity,
        urgentTasks=urgent_tasks,
        todayCreated=today_created,
        todayCompleted=today_completed,
        weekCreated=week_created,
        weekCompleted=week_completed,
    )
