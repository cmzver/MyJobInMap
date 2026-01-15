"""
Finance API
===========
Эндпоинты для финансовой статистики.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel, UserRole, get_db
from app.services import get_current_user, get_current_dispatcher_or_admin


router = APIRouter(prefix="/api/finance", tags=["Finance"])


class FinanceStatsResponse(BaseModel):
    """Общая финансовая статистика"""
    completed_tasks: int
    paid_tasks: int
    remote_tasks: int
    total_amount: float
    
    model_config = ConfigDict(from_attributes=True)


class WorkerStatsResponse(BaseModel):
    """Статистика по работнику"""
    user_id: int
    user_name: str
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    paid_tasks: int
    remote_tasks: int
    total_earned: float
    
    model_config = ConfigDict(from_attributes=True)


def get_period_start(period: Optional[str]) -> Optional[datetime]:
    """Получить начало периода"""
    if not period or period == "all":
        return None
    
    now = datetime.now(timezone.utc)
    
    if period == "week":
        days_since_monday = now.weekday()
        return (now - timedelta(days=days_since_monday)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    elif period == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    return None


@router.get("/stats", response_model=FinanceStatsResponse)
async def get_finance_stats(
    period: Optional[str] = Query(None, description="Period: all, week, month"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin)
):
    """
    Получить финансовую статистику
    
    - **period**: all, week, month
    - **user_id**: опционально - фильтр по пользователю
    """
    period_start = get_period_start(period)
    
    # Базовый запрос - только выполненные задачи
    query = db.query(TaskModel).filter(TaskModel.status == "DONE")
    
    # Фильтр по периоду
    if period_start:
        query = query.filter(TaskModel.updated_at >= period_start)
    
    # Фильтр по пользователю
    if user_id:
        query = query.filter(TaskModel.assigned_user_id == user_id)
    
    tasks = query.all()
    
    completed_tasks = len(tasks)
    paid_tasks = sum(1 for t in tasks if t.is_paid)
    remote_tasks = sum(1 for t in tasks if t.is_remote)
    total_amount = sum(t.payment_amount or 0.0 for t in tasks if t.is_paid)
    
    return FinanceStatsResponse(
        completed_tasks=completed_tasks,
        paid_tasks=paid_tasks,
        remote_tasks=remote_tasks,
        total_amount=total_amount
    )


@router.get("/workers", response_model=List[WorkerStatsResponse])
async def get_workers_stats(
    period: Optional[str] = Query(None, description="Period: all, week, month"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin)
):
    """
    Получить статистику по работникам
    
    - **period**: all, week, month
    """
    period_start = get_period_start(period)
    
    # Получаем всех работников
    workers = db.query(UserModel).filter(
        UserModel.role.in_([UserRole.WORKER.value, UserRole.DISPATCHER.value]),
        UserModel.is_active == True
    ).all()
    
    result = []
    
    for worker in workers:
        # Базовый запрос для работника
        query = db.query(TaskModel).filter(
            TaskModel.assigned_user_id == worker.id
        )
        
        # Фильтр по периоду
        if period_start:
            query = query.filter(TaskModel.created_at >= period_start)
        
        tasks = query.all()
        
        total_tasks = len(tasks)
        completed_tasks = sum(1 for t in tasks if t.status == "DONE")
        in_progress_tasks = sum(1 for t in tasks if t.status == "IN_PROGRESS")
        
        # Только из выполненных задач
        completed_list = [t for t in tasks if t.status == "DONE"]
        paid_tasks = sum(1 for t in completed_list if t.is_paid)
        remote_tasks = sum(1 for t in completed_list if t.is_remote)
        total_earned = sum(t.payment_amount or 0.0 for t in completed_list if t.is_paid)
        
        result.append(WorkerStatsResponse(
            user_id=worker.id,
            user_name=worker.full_name or worker.username,
            total_tasks=total_tasks,
            completed_tasks=completed_tasks,
            in_progress_tasks=in_progress_tasks,
            paid_tasks=paid_tasks,
            remote_tasks=remote_tasks,
            total_earned=total_earned
        ))
    
    # Сортируем по количеству выполненных задач
    result.sort(key=lambda x: x.completed_tasks, reverse=True)
    
    return result
