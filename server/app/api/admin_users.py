"""
Admin Users API
===============
Эндпоинты управления пользователями (только для админа).
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    UserModel, TaskModel, UserRole, get_db,
)
from app.schemas import (
    UserCreate, UserUpdate, UserResponse, UserStatsResponse,
)
from app.services import (
    get_password_hash,
    get_current_admin,
    get_current_dispatcher_or_admin,
)
from app.services.audit_log import audit_user_created, audit_user_updated, audit_user_deleted
from app.services.role_utils import canonical_role_value
from app.services.tenant_filter import TenantFilter
from app.utils import user_to_response


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin - Users"])


@router.get("/users", response_model=List[UserResponse])
async def get_users(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить список пользователей"""
    tenant = TenantFilter(admin)
    users = tenant.apply(db.query(UserModel), UserModel).all()
    return [user_to_response(u) for u in users]


@router.get("/workers", response_model=List[UserResponse])
async def get_workers(
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin)
):
    """Получить список работников (для диспетчеров и админов)"""
    tenant = TenantFilter(user)
    workers = tenant.apply(db.query(UserModel), UserModel).filter(
        UserModel.role.in_([UserRole.WORKER.value, UserRole.DISPATCHER.value]),
        UserModel.is_active == True
    ).all()
    return [user_to_response(u) for u in workers]


@router.get("/users/{user_id}/stats", response_model=UserStatsResponse)
async def get_user_stats(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить статистику пользователя"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    tenant = TenantFilter(admin)
    tenant.enforce_access(user)
    
    all_tasks = tenant.apply(db.query(TaskModel), TaskModel).filter(TaskModel.assigned_user_id == user_id).all()
    
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
        earnings_this_week=earnings_this_week
    )


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Создать пользователя"""
    existing = db.query(UserModel).filter(UserModel.username == user_data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    tenant = TenantFilter(admin)
    
    # Org-admin может создавать только worker/dispatcher
    requested_role = canonical_role_value(user_data.role)
    if not tenant.is_superadmin:
        if requested_role == UserRole.ADMIN.value:
            raise HTTPException(
                status_code=403,
                detail="Org-admin cannot create admin users"
            )
        # Проверка лимита пользователей организации
        if admin.organization and admin.organization.max_users:
            current_count = db.query(UserModel).filter(
                UserModel.organization_id == admin.organization_id
            ).count()
            if current_count >= admin.organization.max_users:
                raise HTTPException(
                    status_code=400,
                    detail=f"Достигнут лимит пользователей организации ({admin.organization.max_users})"
                )
    
    user = UserModel(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        email=user_data.email,
        phone=user_data.phone,
        role=requested_role
    )
    # Привязка к организации:
    # - Суперадмин может указать organization_id явно
    # - Org-admin автоматически привязывает к своей организации
    if requested_role == UserRole.ADMIN.value and user_data.role == UserRole.SUPERADMIN:
        user.organization_id = None
    elif tenant.is_superadmin and user_data.organization_id:
        user.organization_id = user_data.organization_id
    else:
        tenant.set_org_id(user)
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    audit_user_created(admin.id, admin.username, user.id, user.username)
    
    return user_to_response(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Обновить пользователя"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    tenant = TenantFilter(admin)
    # Org-admin может редактировать только пользователей своей организации
    requested_role = canonical_role_value(user_data.role) if user_data.role is not None else None
    if not tenant.is_superadmin:
        tenant.enforce_access(user)
        # Org-admin не может назначать роль admin
        if requested_role == UserRole.ADMIN.value:
            raise HTTPException(status_code=403, detail="Org-admin cannot assign admin role")
    
    if user_data.username is not None:
        new_username = user_data.username.strip()
        if not new_username:
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        existing_user = db.query(UserModel).filter(
            UserModel.username == new_username,
            UserModel.id != user.id,
        ).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = new_username

    if user_data.password is not None:
        if not user_data.password:
            raise HTTPException(status_code=400, detail="Password cannot be empty")
        user.password_hash = get_password_hash(user_data.password)

    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    if user_data.email is not None:
        user.email = user_data.email
    if user_data.phone is not None:
        user.phone = user_data.phone
    if user_data.role is not None:
        user.role = requested_role
        if user_data.role == UserRole.SUPERADMIN:
            user.organization_id = None
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    
    db.commit()
    db.refresh(user)
    
    audit_user_updated(admin.id, admin.username, user_id, str(user_data.model_dump(exclude_unset=True)))
    
    return user_to_response(user)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить пользователя"""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Org-admin может удалять только пользователей своей организации
    tenant = TenantFilter(admin)
    if not tenant.is_superadmin:
        tenant.enforce_access(user)
    
    db.delete(user)
    db.commit()
    audit_user_deleted(admin.id, admin.username, user_id, user.username)
    return {"message": "User deleted", "id": user_id}
