"""
Admin Users API
===============
Тонкие контроллеры управления пользователями (только для админа).
Бизнес-логика CRUD — в app/services/user_service.py (UserService).
"""

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel, get_db
from app.schemas import UserCreate, UserResponse, UserStatsResponse, UserUpdate
from app.services import (
    UserService,
    UserServiceError,
    get_current_admin,
    get_current_dispatcher_or_admin,
    get_user_service,
)
from app.services.tenant_filter import TenantFilter
from app.utils import user_to_response

router = APIRouter(prefix="/api/admin", tags=["Admin - Users"])


@router.get("/users", response_model=List[UserResponse])
async def get_users(
    admin: UserModel = Depends(get_current_admin),
    service: UserService = Depends(get_user_service),
):
    """Получить список пользователей"""
    return [user_to_response(u) for u in service.list_users(admin)]


@router.get("/workers", response_model=List[UserResponse])
async def get_workers(
    user: UserModel = Depends(get_current_dispatcher_or_admin),
    service: UserService = Depends(get_user_service),
):
    """Получить список работников (для диспетчеров и админов)"""
    return [user_to_response(u) for u in service.list_workers(user)]


@router.get("/users/{user_id}/stats", response_model=UserStatsResponse)
async def get_user_stats(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Получить статистику пользователя"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    tenant = TenantFilter(admin)
    tenant.enforce_access(user)

    all_tasks = (
        tenant.apply(db.query(TaskModel), TaskModel)
        .filter(TaskModel.assigned_user_id == user_id)
        .all()
    )

    total_tasks = len(all_tasks)
    completed_tasks = sum(1 for t in all_tasks if t.status == "DONE")
    in_progress_tasks = sum(1 for t in all_tasks if t.status == "IN_PROGRESS")
    new_tasks = sum(1 for t in all_tasks if t.status == "NEW")

    completed_paid_tasks = [t for t in all_tasks if t.status == "DONE" and t.is_paid]
    total_earnings = sum(t.payment_amount or 0.0 for t in completed_paid_tasks)
    paid_tasks_count = len(completed_paid_tasks)
    remote_tasks_count = sum(1 for t in all_tasks if t.is_remote)

    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start_of_week = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    def _as_utc(value):
        if not value:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    completed_this_month = 0
    earnings_this_month = 0.0
    completed_this_week = 0
    earnings_this_week = 0.0

    for task in all_tasks:
        if task.status != "DONE" or not task.completed_at:
            continue

        completed_at = _as_utc(task.completed_at)
        if not completed_at:
            continue

        if completed_at >= start_of_month:
            completed_this_month += 1
            if task.is_paid:
                earnings_this_month += task.payment_amount or 0.0

        if completed_at >= start_of_week:
            completed_this_week += 1
            if task.is_paid:
                earnings_this_week += task.payment_amount or 0.0

    return UserStatsResponse(
        user_id=user.id,
        username=user.username,
        full_name=user.full_name or "",
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        in_progress_tasks=in_progress_tasks,
        new_tasks=new_tasks,
        total_earnings=total_earnings,
        paid_tasks_count=paid_tasks_count,
        remote_tasks_count=remote_tasks_count,
        completed_this_month=completed_this_month,
        earnings_this_month=earnings_this_month,
        completed_this_week=completed_this_week,
        earnings_this_week=earnings_this_week,
    )


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    admin: UserModel = Depends(get_current_admin),
    service: UserService = Depends(get_user_service),
):
    """Создать пользователя"""
    try:
        user = service.create(admin, user_data)
    except UserServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return user_to_response(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    admin: UserModel = Depends(get_current_admin),
    service: UserService = Depends(get_user_service),
):
    """Обновить пользователя"""
    try:
        user = service.update(admin, user_id, user_data)
    except UserServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return user_to_response(user)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: UserModel = Depends(get_current_admin),
    service: UserService = Depends(get_user_service),
):
    """Удалить пользователя"""
    try:
        service.delete(admin, user_id)
    except UserServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"message": "User deleted", "id": user_id}
