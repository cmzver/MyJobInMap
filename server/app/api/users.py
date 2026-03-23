"""
Users API (Alias)
=================
Публичные эндпоинты для работы с пользователями.
Алиас для /api/admin/users с ограниченными правами.
"""

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel, get_db
from app.schemas import UserCreate, UserResponse, UserUpdate
from app.services import (get_current_admin, get_current_user_required,
                          get_password_hash)
from app.services.role_utils import canonical_role_value
from app.services.tenant_filter import TenantFilter
from app.utils import user_to_response

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
    return [user_to_response(u) for u in users]


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


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user_required),
):
    """Получить пользователя по ID"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    TenantFilter(current_user).enforce_access(user)
    return user_to_response(user)


@router.post("", response_model=UserResponse)
async def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Создать пользователя (только админ)"""
    # Проверка на дубликат
    existing = db.query(UserModel).filter(UserModel.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    tenant = TenantFilter(admin)
    requested_role = canonical_role_value(data.role)

    user = UserModel(
        username=data.username,
        password_hash=get_password_hash(data.password),
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        role=requested_role,
        is_active=True,
    )

    if tenant.is_superadmin and data.organization_id is not None:
        user.organization_id = data.organization_id
    else:
        tenant.set_org_id(user)

    db.add(user)
    db.commit()
    db.refresh(user)

    return user_to_response(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Обновить пользователя (только админ)"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    TenantFilter(admin).enforce_access(user)
    requested_role = canonical_role_value(data.role) if data.role is not None else None

    if data.username is not None:
        new_username = data.username.strip()
        if not new_username:
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        existing_user = (
            db.query(UserModel)
            .filter(
                UserModel.username == new_username,
                UserModel.id != user.id,
            )
            .first()
        )
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = new_username
    if data.password is not None:
        if not data.password:
            raise HTTPException(status_code=400, detail="Password cannot be empty")
        user.password_hash = get_password_hash(data.password)
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        user.email = data.email
    if data.phone is not None:
        user.phone = data.phone
    if data.role is not None:
        user.role = requested_role
    if data.is_active is not None:
        user.is_active = data.is_active

    db.commit()
    db.refresh(user)

    return user_to_response(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Удалить пользователя (только админ)"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    TenantFilter(admin).enforce_access(user)

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    db.delete(user)
    db.commit()

    return {"success": True}
