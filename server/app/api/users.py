"""
Users API (Alias)
=================
Публичные эндпоинты для работы с пользователями.
Алиас для /api/admin/users с ограниченными правами.
"""

from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import UserModel, TaskModel, get_db
from app.schemas import UserCreate, UserUpdate, UserResponse
from app.services import get_password_hash, get_current_user, get_current_admin
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
    current_user: UserModel = Depends(get_current_user)
):
    """Получить список пользователей (для назначения исполнителей)"""
    # Показываем всех активных пользователей
    users = db.query(UserModel).filter(UserModel.is_active == True).all()
    return [user_to_response(u) for u in users]


@router.get("/me/stats", response_model=UserStatsResponse)
async def get_my_stats(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Получить статистику текущего пользователя"""
    user_id = current_user.id
    
    # Все задачи пользователя
    all_tasks = db.query(TaskModel).filter(
        TaskModel.assigned_user_id == user_id
    ).all()
    
    total_tasks = len(all_tasks)
    completed_tasks = sum(1 for t in all_tasks if t.status == "DONE")
    in_progress_tasks = sum(1 for t in all_tasks if t.status == "IN_PROGRESS")
    
    # Процент выполнения
    completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
    
    # Среднее время выполнения (в часах)
    completed_with_time = [
        t for t in all_tasks 
        if t.status == "DONE" and t.completed_at and t.created_at
    ]
    
    avg_completion_hours = None
    if completed_with_time:
        total_hours = 0
        for t in completed_with_time:
            # Убираем timezone info если есть
            created = t.created_at.replace(tzinfo=None) if t.created_at.tzinfo else t.created_at
            completed = t.completed_at.replace(tzinfo=None) if t.completed_at.tzinfo else t.completed_at
            diff = completed - created
            total_hours += diff.total_seconds() / 3600
        avg_completion_hours = round(total_hours / len(completed_with_time), 1)
    
    # Задачи за эту неделю
    week_ago = datetime.now() - timedelta(days=7)
    tasks_this_week = sum(
        1 for t in all_tasks 
        if t.created_at and t.created_at.replace(tzinfo=None) >= week_ago
    )
    
    # Задачи за этот месяц
    month_ago = datetime.now() - timedelta(days=30)
    tasks_this_month = sum(
        1 for t in all_tasks 
        if t.created_at and t.created_at.replace(tzinfo=None) >= month_ago
    )
    
    # Серия дней с выполненными заявками
    streak_days = 0
    today = datetime.now().date()
    for i in range(365):  # Максимум год назад
        check_date = today - timedelta(days=i)
        has_completed = any(
            t.completed_at and t.completed_at.date() == check_date
            for t in all_tasks if t.status == "DONE"
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
        streak_days=streak_days
    )


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Получить пользователя по ID"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_to_response(user)


@router.post("", response_model=UserResponse)
async def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Создать пользователя (только админ)"""
    # Проверка на дубликат
    existing = db.query(UserModel).filter(UserModel.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user = UserModel(
        username=data.username,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        role=data.role,
        is_active=data.is_active if data.is_active is not None else True
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user_to_response(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Обновить пользователя (только админ)"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Обновляем поля
    if data.username is not None:
        # Проверка на дубликат
        existing = db.query(UserModel).filter(
            UserModel.username == data.username,
            UserModel.id != user_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = data.username
    
    if data.password:
        user.hashed_password = get_password_hash(data.password)
    
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        user.email = data.email
    if data.phone is not None:
        user.phone = data.phone
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    
    db.commit()
    db.refresh(user)
    
    return user_to_response(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить пользователя (только админ)"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    db.delete(user)
    db.commit()
    
    return {"success": True}
