"""
Admin API
=========
Эндпоинты для администрирования: Tasks, Devices, Custom Fields, Permissions.

Пользователи вынесены в admin_users.py.
Бэкапы и инструменты БД вынесены в admin_backups.py.
"""

import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (CustomFieldModel, DeviceModel, RolePermissionModel,
                        TaskModel, UserModel, get_db)
from app.schemas import (CustomFieldCreate, CustomFieldResponse,
                         CustomFieldUpdate, DeviceResponse,
                         RolePermissionsResponse, TaskResponse, TaskUpdate,
                         UpdateRolePermissionRequest)
from app.services import (geocoding_service, get_current_admin,
                          get_current_dispatcher_or_admin,
                          get_current_superadmin)
from app.services.task_service import TaskService
from app.services.tenant_filter import TenantFilter
from app.utils import task_to_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ============================================================================
# Tasks
# ============================================================================


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def admin_update_task(
    task_id: int,
    task_data: TaskUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Обновить заявку (админ)"""
    tenant = TenantFilter(admin)
    task = (
        tenant.apply(db.query(TaskModel), TaskModel)
        .filter(TaskModel.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task_data.title is not None:
        task.title = task_data.title
    if task_data.address is not None:
        task.raw_address = task_data.address
        lat, lon = TaskService(db).resolve_coordinates(
            task_data.address,
            task.organization_id or admin.organization_id,
        )
        task.lat = lat
        task.lon = lon
    if task_data.description is not None:
        task.description = task_data.description
    if task_data.customer_name is not None:
        task.customer_name = task_data.customer_name
    if task_data.customer_phone is not None:
        task.customer_phone = task_data.customer_phone
    if task_data.status is not None:
        old_status = task.status
        task.status = task_data.status
        if task_data.status == "DONE" and old_status != "DONE":
            task.completed_at = datetime.now(timezone.utc)
        elif task_data.status != "DONE":
            task.completed_at = None
    if task_data.priority is not None:
        task.priority = task_data.priority

    # Используем dict(exclude_unset=True) чтобы можно было сбросить дату (передать null)
    update_data = task_data.model_dump(exclude_unset=True)
    if "planned_date" in update_data:
        task.planned_date = update_data["planned_date"]

    if task_data.is_remote is not None:
        task.is_remote = task_data.is_remote
    if task_data.is_paid is not None:
        task.is_paid = task_data.is_paid
    if task_data.payment_amount is not None:
        task.payment_amount = task_data.payment_amount

    # Система и тип неисправности
    if task_data.system_id is not None:
        task.system_id = task_data.system_id
    if task_data.system_type is not None:
        task.system_type = task_data.system_type
    if task_data.defect_type is not None:
        task.defect_type = task_data.defect_type

    old_assigned_user_id = task.assigned_user_id
    new_assigned_user_id = None

    if "assigned_user_id" in update_data:
        if update_data["assigned_user_id"] is None:
            task.assigned_user_id = None
        else:
            assigned_user = (
                db.query(UserModel)
                .filter(UserModel.id == update_data["assigned_user_id"])
                .first()
            )
            if not assigned_user:
                raise HTTPException(status_code=404, detail="User not found")
            tenant.enforce_access(
                assigned_user, detail="Cannot assign user from another organization"
            )
            task.assigned_user_id = assigned_user.id
            new_assigned_user_id = assigned_user.id

    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)

    # Send push notification to newly assigned user
    from app.utils import send_task_assignment_notification

    send_task_assignment_notification(task, new_assigned_user_id, old_assigned_user_id)

    return task_to_response(task)


# ============================================================================
# Devices
# ============================================================================


@router.get("/devices", response_model=List[DeviceResponse])
async def get_devices(
    db: Session = Depends(get_db), admin: UserModel = Depends(get_current_superadmin)
):
    """Получить список устройств"""
    tenant = TenantFilter(admin)
    devices_query = db.query(DeviceModel).join(
        UserModel, DeviceModel.user_id == UserModel.id
    )
    if not tenant.is_superadmin:
        devices_query = devices_query.filter(
            UserModel.organization_id == admin.organization_id
        )
    devices = devices_query.all()
    return [
        DeviceResponse(
            id=d.id,
            user_id=d.user_id,
            user_name=d.user.full_name if d.user else None,
            fcm_token=d.fcm_token,
            device_name=d.device_name,
            created_at=d.created_at,
            last_active=d.last_active,
        )
        for d in devices
    ]


@router.delete("/devices/{device_id}")
async def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Удалить устройство"""
    tenant = TenantFilter(admin)
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.user:
        tenant.enforce_access(device.user, detail="Device not found")

    db.delete(device)
    db.commit()
    return {"message": "Device deleted", "id": device_id}


# ============================================================================
# Custom Fields
# ============================================================================


@router.get("/custom-fields", response_model=List[CustomFieldResponse])
async def get_custom_fields(
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin),
):
    """Получить список кастомных полей"""
    return db.query(CustomFieldModel).order_by(CustomFieldModel.id).all()


@router.post("/custom-fields", response_model=CustomFieldResponse)
async def create_custom_field(
    field_data: CustomFieldCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Создать кастомное поле"""
    existing = (
        db.query(CustomFieldModel)
        .filter(CustomFieldModel.name == field_data.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Field name already exists")

    field = CustomFieldModel(**field_data.model_dump())
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.patch("/custom-fields/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    field_id: int,
    field_data: CustomFieldUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Обновить кастомное поле"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    for key, value in field_data.model_dump(exclude_unset=True).items():
        setattr(field, key, value)

    db.commit()
    db.refresh(field)
    return field


@router.delete("/custom-fields/{field_id}")
async def delete_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Удалить кастомное поле"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    db.delete(field)
    db.commit()
    return {"message": "Field deleted"}


@router.patch("/custom-fields/{field_id}/toggle")
async def toggle_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Переключить активность поля"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    field.is_active = not field.is_active
    db.commit()
    return {"message": "Field status toggled", "is_active": field.is_active}


# ============================================================================
# Permissions
# ============================================================================


@router.get("/permissions", response_model=RolePermissionsResponse)
async def get_permissions(
    db: Session = Depends(get_db), admin: UserModel = Depends(get_current_superadmin)
):
    """Получить матрицу прав доступа"""
    perms = db.query(RolePermissionModel).all()
    result = {"admin": {}, "dispatcher": {}, "worker": {}}

    # Заполняем дефолтные права если база пуста (упрощение)
    default_permissions = [
        # Worker
        ("worker", "view_tasks", True),
        ("worker", "change_task_status", True),
        ("worker", "view_comments", True),
        ("worker", "add_comments", True),
        ("worker", "add_photos", True),
        # Dispatcher
        ("dispatcher", "view_dashboard", True),
        ("dispatcher", "view_tasks", True),
        ("dispatcher", "create_tasks", True),
        ("dispatcher", "edit_tasks", True),
        ("dispatcher", "view_users", True),
    ]

    if not perms:
        for role, perm, val in default_permissions:
            db.add(RolePermissionModel(role=role, permission=perm, is_allowed=val))
        db.commit()
        perms = db.query(RolePermissionModel).all()

    for p in perms:
        if p.role in result:
            result[p.role][p.permission] = p.is_allowed

    # Admin всегда имеет всё (виртуально)

    return result


@router.patch("/permissions/{role}")
async def update_role_permission(
    role: str,
    update: UpdateRolePermissionRequest,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Обновить права роли"""
    if role not in ["dispatcher", "worker"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    for perm, allowed in update.permissions.items():
        db_perm = (
            db.query(RolePermissionModel)
            .filter(
                RolePermissionModel.role == role, RolePermissionModel.permission == perm
            )
            .first()
        )

        if db_perm:
            db_perm.is_allowed = allowed
        else:
            db.add(RolePermissionModel(role=role, permission=perm, is_allowed=allowed))

    db.commit()
    return {"message": "Permissions updated"}
