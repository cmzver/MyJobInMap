"""
Reports API
===========
Эндпоинты для отчётов и аналитики.
"""

from datetime import datetime, timedelta, timezone, date
from typing import List, Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract

from app.models import TaskModel, UserModel, UserRole, get_db
from app.utils import normalize_priority_value
from app.services import get_current_dispatcher_or_admin


router = APIRouter(prefix="/api/reports", tags=["Reports"])


# ============================================================================
# Pydantic Models
# ============================================================================

class TasksByStatusItem(BaseModel):
    """Задачи по статусу"""
    status: str
    count: int
    label: str


class TasksByPriorityItem(BaseModel):
    """Задачи по приоритету"""
    priority: str
    count: int
    label: str


class TasksByDayItem(BaseModel):
    """Задачи по дням"""
    date: str
    created: int
    completed: int


class TasksByWorkerItem(BaseModel):
    """Задачи по исполнителям"""
    user_id: int
    user_name: str
    total: int
    completed: int
    in_progress: int
    new_tasks: int


class CompletionTimeStats(BaseModel):
    """Статистика времени выполнения"""
    avg_hours: float
    min_hours: float
    max_hours: float
    total_completed: int


class ReportsSummary(BaseModel):
    """Общая сводка по отчётам"""
    total_tasks: int
    completed_tasks: int
    completion_rate: float
    avg_tasks_per_day: float
    period_days: int


class ReportsResponse(BaseModel):
    """Полный ответ отчётов"""
    summary: ReportsSummary
    by_status: List[TasksByStatusItem]
    by_priority: List[TasksByPriorityItem]
    by_day: List[TasksByDayItem]
    by_worker: List[TasksByWorkerItem]
    completion_time: Optional[CompletionTimeStats]


# ============================================================================
# Helpers
# ============================================================================

STATUS_LABELS = {
    "NEW": "Новые",
    "IN_PROGRESS": "В работе",
    "DONE": "Выполненные",
    "CANCELLED": "Отменённые",
}

PRIORITY_LABELS = {
    "EMERGENCY": "Аварийные",
    "URGENT": "Срочные",
    "CURRENT": "Текущие",
    "PLANNED": "Плановые",
}

# Маппинг int приоритетов в строки (TaskPriority enum values)

def get_date_range(period: str, custom_from: Optional[date], custom_to: Optional[date]):
    """Получить диапазон дат для периода"""
    now = datetime.now(timezone.utc)
    today = now.date()
    
    if period == "custom" and custom_from and custom_to:
        return (
            datetime.combine(custom_from, datetime.min.time()).replace(tzinfo=timezone.utc),
            datetime.combine(custom_to, datetime.max.time()).replace(tzinfo=timezone.utc),
            (custom_to - custom_from).days + 1
        )
    
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now, 1
    
    if period == "yesterday":
        yesterday = today - timedelta(days=1)
        start = datetime.combine(yesterday, datetime.min.time()).replace(tzinfo=timezone.utc)
        end = datetime.combine(yesterday, datetime.max.time()).replace(tzinfo=timezone.utc)
        return start, end, 1
    
    if period == "week":
        days_since_monday = now.weekday()
        start = (now - timedelta(days=days_since_monday)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return start, now, days_since_monday + 1
    
    if period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, now, today.day
    
    if period == "quarter":
        quarter_start_month = ((now.month - 1) // 3) * 3 + 1
        start = now.replace(month=quarter_start_month, day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, now, (now - start).days + 1
    
    if period == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, now, (now - start).days + 1
    
    # "all" - все время
    return None, None, None


# ============================================================================
# Endpoints
# ============================================================================

@router.get("", response_model=ReportsResponse)
async def get_reports(
    period: str = Query("month", description="Period: today, yesterday, week, month, quarter, year, all, custom"),
    date_from: Optional[date] = Query(None, description="Custom period start (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="Custom period end (YYYY-MM-DD)"),
    worker_id: Optional[int] = Query(None, description="Filter by worker ID"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin)
):
    """
    Получить данные для отчётов
    
    Возвращает статистику по:
    - Статусам задач
    - Приоритетам
    - Дням (динамика)
    - Исполнителям
    - Времени выполнения
    """
    start_date, end_date, period_days = get_date_range(period, date_from, date_to)
    
    # Базовый запрос
    query = db.query(TaskModel)
    
    if start_date:
        query = query.filter(TaskModel.created_at >= start_date)
    if end_date:
        query = query.filter(TaskModel.created_at <= end_date)
    if worker_id:
        query = query.filter(TaskModel.assigned_user_id == worker_id)
    
    tasks = query.all()
    
    # === Summary ===
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.status == "DONE")
    completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
    
    if period_days and period_days > 0:
        avg_tasks_per_day = total_tasks / period_days
    else:
        # Для "all" считаем по фактическому диапазону
        if tasks:
            min_date = min(t.created_at for t in tasks)
            max_date = max(t.created_at for t in tasks)
            actual_days = (max_date - min_date).days + 1
            avg_tasks_per_day = total_tasks / actual_days if actual_days > 0 else total_tasks
            period_days = actual_days
        else:
            avg_tasks_per_day = 0
            period_days = 0
    
    summary = ReportsSummary(
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        completion_rate=round(completion_rate, 1),
        avg_tasks_per_day=round(avg_tasks_per_day, 1),
        period_days=period_days or 0
    )
    
    # === By Status ===
    status_counts = defaultdict(int)
    for t in tasks:
        status_counts[t.status] += 1
    
    by_status = [
        TasksByStatusItem(
            status=status,
            count=count,
            label=STATUS_LABELS.get(status, status)
        )
        for status, count in status_counts.items()
    ]
    # Сортируем по порядку статусов
    status_order = ["NEW", "IN_PROGRESS", "DONE", "CANCELLED"]
    by_status.sort(key=lambda x: status_order.index(x.status) if x.status in status_order else 99)
    
    # === By Priority ===
    priority_counts = defaultdict(int)
    for t in tasks:
        priority_str = normalize_priority_value(t.priority, default="CURRENT")
        priority_counts[priority_str] += 1
    
    by_priority = [
        TasksByPriorityItem(
            priority=priority,
            count=count,
            label=PRIORITY_LABELS.get(priority, priority)
        )
        for priority, count in priority_counts.items()
    ]
    # Сортируем по важности
    priority_order = ["EMERGENCY", "URGENT", "CURRENT", "PLANNED"]
    by_priority.sort(key=lambda x: priority_order.index(x.priority) if x.priority in priority_order else 99)
    
    # === By Day ===
    # Группируем по дате создания и завершения
    created_by_day = defaultdict(int)
    completed_by_day = defaultdict(int)
    
    for t in tasks:
        day_key = t.created_at.strftime("%Y-%m-%d")
        created_by_day[day_key] += 1
        
        if t.status == "DONE" and t.updated_at:
            completed_day = t.updated_at.strftime("%Y-%m-%d")
            completed_by_day[completed_day] += 1
    
    # Объединяем все дни
    all_days = sorted(set(created_by_day.keys()) | set(completed_by_day.keys()))
    
    # Ограничиваем последними 30 днями для читаемости
    if len(all_days) > 30:
        all_days = all_days[-30:]
    
    by_day = [
        TasksByDayItem(
            date=day,
            created=created_by_day.get(day, 0),
            completed=completed_by_day.get(day, 0)
        )
        for day in all_days
    ]
    
    # === By Worker ===
    workers = db.query(UserModel).filter(
        UserModel.role.in_([UserRole.WORKER.value, UserRole.DISPATCHER.value]),
        UserModel.is_active == True
    ).all()
    
    worker_stats = []
    for worker in workers:
        worker_tasks = [t for t in tasks if t.assigned_user_id == worker.id]
        if not worker_tasks and not worker_id:  # Скрываем работников без задач если нет фильтра
            continue
            
        total = len(worker_tasks)
        completed = sum(1 for t in worker_tasks if t.status == "DONE")
        in_progress = sum(1 for t in worker_tasks if t.status == "IN_PROGRESS")
        new_tasks = sum(1 for t in worker_tasks if t.status == "NEW")
        
        worker_stats.append(TasksByWorkerItem(
            user_id=worker.id,
            user_name=worker.full_name or worker.username,
            total=total,
            completed=completed,
            in_progress=in_progress,
            new_tasks=new_tasks
        ))
    
    # Сортируем по количеству задач
    worker_stats.sort(key=lambda x: x.total, reverse=True)
    
    # === Completion Time ===
    completion_time = None
    completed_with_times = [
        t for t in tasks 
        if t.status == "DONE" and t.created_at and t.updated_at
    ]
    
    if completed_with_times:
        durations_hours = []
        for t in completed_with_times:
            duration = (t.updated_at - t.created_at).total_seconds() / 3600
            if duration >= 0:  # Игнорируем отрицательные значения
                durations_hours.append(duration)
        
        if durations_hours:
            completion_time = CompletionTimeStats(
                avg_hours=round(sum(durations_hours) / len(durations_hours), 1),
                min_hours=round(min(durations_hours), 1),
                max_hours=round(max(durations_hours), 1),
                total_completed=len(durations_hours)
            )
    
    return ReportsResponse(
        summary=summary,
        by_status=by_status,
        by_priority=by_priority,
        by_day=by_day,
        by_worker=worker_stats,
        completion_time=completion_time
    )


@router.get("/export")
async def export_report(
    period: str = Query("month", description="Period"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    format: str = Query("csv", description="Export format: csv"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin)
):
    """
    Экспорт отчёта в CSV
    """
    from fastapi.responses import StreamingResponse
    import io
    
    start_date, end_date, _ = get_date_range(period, date_from, date_to)
    
    query = db.query(TaskModel)
    if start_date:
        query = query.filter(TaskModel.created_at >= start_date)
    if end_date:
        query = query.filter(TaskModel.created_at <= end_date)
    
    tasks = query.order_by(TaskModel.created_at.desc()).all()
    
    # Генерируем CSV
    output = io.StringIO()
    output.write('\ufeff')  # BOM для Excel
    
    # Заголовки
    headers = [
        "ID", "Номер", "Название", "Адрес", "Статус", "Приоритет",
        "Исполнитель", "Создана", "Обновлена", "Платная", "Сумма"
    ]
    output.write(";".join(headers) + "\n")
    
    # Данные
    for t in tasks:
        row = [
            str(t.id),
            t.task_number or "",
            (t.title or "").replace(";", ",").replace("\n", " "),
            (t.address or "").replace(";", ",").replace("\n", " "),
            STATUS_LABELS.get(t.status, t.status),
            PRIORITY_LABELS.get(normalize_priority_value(t.priority, default="CURRENT"), normalize_priority_value(t.priority, default="CURRENT") or ""),
            t.assigned_user.full_name if t.assigned_user else "",
            t.created_at.strftime("%d.%m.%Y %H:%M") if t.created_at else "",
            t.updated_at.strftime("%d.%m.%Y %H:%M") if t.updated_at else "",
            "Да" if t.is_paid else "Нет",
            str(t.payment_amount or 0),
        ]
        output.write(";".join(row) + "\n")
    
    output.seek(0)
    
    filename = f"report_{period}_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
