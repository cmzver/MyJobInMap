"""
Admin API
=========
Эндпоинты для администрирования.
"""

from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models import (
    UserModel, DeviceModel, TaskModel, CommentModel,
    CustomFieldModel, RolePermissionModel, SystemSettingModel,
    UserRole, TaskPriority, get_db, get_setting, set_setting
)
from app.schemas import (
    UserCreate, UserUpdate, UserResponse,
    UserStatsResponse, DeviceResponse,
    TaskUpdate, TaskResponse,
    CustomFieldCreate, CustomFieldUpdate, CustomFieldResponse,
    RolePermissionsResponse, UpdateRolePermissionRequest,
    BackupListResponse, BackupFile,
    BackupSettingsSchema, BackupSettingsResponse
)
from app.services import (
    get_password_hash,
    get_current_admin,
    get_current_dispatcher_or_admin,
    geocoding_service
)
from app.utils import task_to_response, user_to_response
import os
import shutil
import gzip
from app.config import settings
import json
from pathlib import Path
import sqlite3


router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ============================================================================
# Users
# ============================================================================

@router.get("/users", response_model=List[UserResponse])
async def get_users(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить список пользователей"""
    users = db.query(UserModel).all()
    return [user_to_response(u) for u in users]


@router.get("/workers", response_model=List[UserResponse])
async def get_workers(
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin)
):
    """Получить список работников (для диспетчеров и админов)"""
    workers = db.query(UserModel).filter(
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
    
    all_tasks = db.query(TaskModel).filter(TaskModel.assigned_user_id == user_id).all()
    
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
    
    user = UserModel(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        email=user_data.email,
        phone=user_data.phone,
        role=user_data.role.value
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user_to_response(user)


@router.put("/users/{user_id}", response_model=UserResponse)
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
    
    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    if user_data.email is not None:
        user.email = user_data.email
    if user_data.phone is not None:
        user.phone = user_data.phone
    if user_data.role is not None:
        user.role = user_data.role.value
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    
    db.commit()
    db.refresh(user)
    
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
    
    db.delete(user)
    db.commit()
    return {"message": "User deleted", "id": user_id}


# ============================================================================
# Tasks
# ============================================================================

@router.put("/tasks/{task_id}", response_model=TaskResponse)
async def admin_update_task(
    task_id: int,
    task_data: TaskUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Обновить заявку (админ)"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task_data.title is not None:
        task.title = task_data.title
    if task_data.address is not None:
        task.raw_address = task_data.address
        lat, lon = geocoding_service.geocode(task_data.address)
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
    
    if task_data.assigned_user_id is not None:
        if task_data.assigned_user_id:
            assigned_user = db.query(UserModel).filter(UserModel.id == task_data.assigned_user_id).first()
            if assigned_user:
                task.assigned_user_id = assigned_user.id
                new_assigned_user_id = assigned_user.id
        else:
            task.assigned_user_id = None
    
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
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить список устройств"""
    devices = db.query(DeviceModel).all()
    return [
        DeviceResponse(
            id=d.id,
            user_id=d.user_id,
            user_name=d.user.full_name if d.user else None,
            fcm_token=d.fcm_token,
            device_name=d.device_name,
            created_at=d.created_at,
            last_active=d.last_active
        ) for d in devices
    ]


@router.delete("/devices/{device_id}")
async def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить устройство"""
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    db.delete(device)
    db.commit()
    return {"message": "Device deleted", "id": device_id}


# ============================================================================
# Custom Fields
# ============================================================================

@router.get("/custom-fields", response_model=List[CustomFieldResponse])
async def get_custom_fields(
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin)
):
    """Получить список кастомных полей"""
    return db.query(CustomFieldModel).order_by(CustomFieldModel.id).all()


@router.post("/custom-fields", response_model=CustomFieldResponse)
async def create_custom_field(
    field_data: CustomFieldCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Создать кастомное поле"""
    existing = db.query(CustomFieldModel).filter(CustomFieldModel.name == field_data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Field name already exists")
    
    field = CustomFieldModel(**field_data.model_dump())
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.put("/custom-fields/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    field_id: int,
    field_data: CustomFieldUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
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
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить кастомное поле"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    
    db.delete(field)
    db.commit()
    return {"message": "Field deleted"}


@router.put("/custom-fields/{field_id}/toggle")
async def toggle_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
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
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
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


@router.put("/permissions/{role}")
async def update_role_permission(
    role: str,
    update: UpdateRolePermissionRequest,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Обновить права роли"""
    if role not in ["dispatcher", "worker"]:
        raise HTTPException(status_code=400, detail="Invalid role")
        
    for perm, allowed in update.permissions.items():
        db_perm = db.query(RolePermissionModel).filter(
            RolePermissionModel.role == role,
            RolePermissionModel.permission == perm
        ).first()
        
        if db_perm:
            db_perm.is_allowed = allowed
        else:
            db.add(RolePermissionModel(role=role, permission=perm, is_allowed=allowed))
            
    db.commit()
    return {"message": "Permissions updated"}


# ============================================================================
# Backups
# ============================================================================

BACKUP_DIR = os.path.join(settings.BASE_DIR, "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

@router.get("/backup/list", response_model=BackupListResponse)
async def list_backups(
    admin: UserModel = Depends(get_current_admin)
):
    """Список бэкапов"""
    backups = []
    if os.path.exists(BACKUP_DIR):
        for f in os.listdir(BACKUP_DIR):
            if f.endswith(".sqlite.gz"):
                path = os.path.join(BACKUP_DIR, f)
                stat = os.stat(path)
                backups.append(BackupFile(
                    name=f,
                    size=stat.st_size,
                    created=datetime.fromtimestamp(stat.st_ctime)
                ))
    
    backups.sort(key=lambda x: x.created, reverse=True)
    return {"backups": backups}


@router.post("/backup/run")
async def run_backup(
    admin: UserModel = Depends(get_current_admin)
):
    """Создать бэкап БД (только SQLite)"""
    db_url = settings.DATABASE_URL
    if not db_url.startswith("sqlite"):
        raise HTTPException(status_code=400, detail="Backup is only supported for SQLite")
    
    # Extract path from sqlite:///./tasks.db or sqlite:///tasks.db
    db_path = db_url.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = db_path[2:]
        
    # Resolve absolute path if needed
    if not os.path.isabs(db_path):
        db_path = os.path.join(settings.BASE_DIR.parent, db_path)

    if not os.path.exists(db_path):
        # Fallback check in current dir
        if os.path.exists("tasks.db"):
            db_path = "tasks.db"
        else:
            raise HTTPException(status_code=500, detail=f"Database file not found at {db_path}")
        
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"tasks_db_{timestamp}.sqlite.gz"
    dest_path = os.path.join(BACKUP_DIR, filename)
    
    try:
        with open(db_path, "rb") as f_in:
            with gzip.open(dest_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        return {"status": "ok", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Ключи настроек бэкапа в БД
BACKUP_SETTINGS_KEYS = {
    "backup_auto_enabled": "true",
    "backup_schedule": "daily",
    "backup_retention_days": "30"
}


@router.get("/backup/settings", response_model=BackupSettingsResponse)
async def get_backup_settings(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить настройки резервного копирования"""
    # Используем helper функции для получения настроек
    auto_backup = get_setting(db, "backup_auto_enabled", "true")
    schedule = get_setting(db, "backup_schedule", "daily")
    retention = get_setting(db, "backup_retention_days", "30")
    
    return BackupSettingsResponse(
        auto_backup=auto_backup.lower() == "true",
        schedule=schedule,
        retention_days=int(retention)
    )


@router.put("/backup/settings", response_model=BackupSettingsResponse)
async def update_backup_settings(
    settings_data: BackupSettingsSchema,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Обновить настройки резервного копирования"""
    # Используем helper функции для обновления настроек
    set_setting(db, "backup_auto_enabled", str(settings_data.auto_backup).lower(),
                description="Автоматическое резервное копирование", group="backup")
    set_setting(db, "backup_schedule", settings_data.schedule,
                description="Расписание бэкапов (daily/weekly/manual)", group="backup")
    set_setting(db, "backup_retention_days", str(settings_data.retention_days),
                description="Срок хранения бэкапов (дней)", group="backup")
    
    return BackupSettingsResponse(
        auto_backup=settings_data.auto_backup,
        schedule=settings_data.schedule,
        retention_days=settings_data.retention_days
    )


from fastapi.responses import FileResponse

@router.get("/backup/download/{filename}")
async def download_backup(
    filename: str,
    admin: UserModel = Depends(get_current_admin)
):
    """Скачать бэкап"""
    # Валидация имени файла (защита от path traversal)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    if not filename.endswith(".sqlite.gz"):
        raise HTTPException(status_code=400, detail="Invalid backup file")
    
    file_path = os.path.join(BACKUP_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Backup not found")
    
    return FileResponse(
        file_path,
        media_type="application/gzip",
        filename=filename
    )


@router.delete("/backup/{filename}")
async def delete_backup(
    filename: str,
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить бэкап"""
    # Валидация имени файла (защита от path traversal)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    if not filename.endswith(".sqlite.gz"):
        raise HTTPException(status_code=400, detail="Invalid backup file")
    
    file_path = os.path.join(BACKUP_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Backup not found")
    
    try:
        os.remove(file_path)
        return {"status": "ok", "message": f"Backup {filename} deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup/restore/{filename}")
async def restore_backup(
    filename: str,
    admin: UserModel = Depends(get_current_admin)
):
    """
    Восстановить БД из бэкапа.
    
    Процесс:
    1. Создаётся автоматический бэкап текущего состояния (pre_restore_*)
    2. Распаковывается выбранный бэкап
    3. Заменяется текущая БД
    
    ВАЖНО: После восстановления рекомендуется перезапустить сервер!
    """
    # Валидация имени файла (защита от path traversal)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    if not filename.endswith(".sqlite.gz"):
        raise HTTPException(status_code=400, detail="Invalid backup file")
    
    backup_path = os.path.join(BACKUP_DIR, filename)
    
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="Backup not found")
    
    # Определяем путь к текущей БД
    db_url = settings.DATABASE_URL
    if not db_url.startswith("sqlite"):
        raise HTTPException(status_code=400, detail="Restore is only supported for SQLite")
    
    db_path = db_url.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = db_path[2:]
    
    if not os.path.isabs(db_path):
        db_path = os.path.join(settings.BASE_DIR.parent, db_path)
    
    if not os.path.exists(db_path):
        if os.path.exists("tasks.db"):
            db_path = "tasks.db"
        else:
            raise HTTPException(status_code=500, detail="Current database not found")
    
    try:
        # 1. Создаём бэкап текущего состояния перед восстановлением
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pre_restore_filename = f"pre_restore_{timestamp}.sqlite.gz"
        pre_restore_path = os.path.join(BACKUP_DIR, pre_restore_filename)
        
        with open(db_path, "rb") as f_in:
            with gzip.open(pre_restore_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        # 2. Распаковываем выбранный бэкап во временный файл
        temp_db_path = db_path + ".restore_temp"
        with gzip.open(backup_path, "rb") as f_in:
            with open(temp_db_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        # 3. Проверяем что это валидный SQLite файл
        try:
            conn = sqlite3.connect(temp_db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1")
            cursor.close()
            conn.close()
        except sqlite3.Error as e:
            os.remove(temp_db_path)
            raise HTTPException(status_code=400, detail=f"Invalid SQLite file: {str(e)}")
        
        # 4. Заменяем текущую БД
        # Сохраняем старую БД на всякий случай
        old_db_path = db_path + ".old"
        if os.path.exists(old_db_path):
            os.remove(old_db_path)
        
        os.rename(db_path, old_db_path)
        os.rename(temp_db_path, db_path)
        
        # Удаляем .old файл
        if os.path.exists(old_db_path):
            os.remove(old_db_path)
        
        return {
            "status": "ok",
            "message": f"Database restored from {filename}",
            "pre_restore_backup": pre_restore_filename,
            "warning": "Рекомендуется перезапустить сервер для применения изменений"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # Очистка временных файлов при ошибке
        temp_db_path = db_path + ".restore_temp"
        if os.path.exists(temp_db_path):
            os.remove(temp_db_path)
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")


# ============================================================================
# Database Management
# ============================================================================

@router.post("/db/seed")
async def seed_database(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Добавить тестовые данные в БД"""
    try:
        # Проверяем есть ли уже заявки
        tasks_count = db.query(TaskModel).count()
        if tasks_count > 0:
            raise HTTPException(
                status_code=400, 
                detail="В базе уже есть заявки. Сначала очистите БД, если хотите загрузить тестовые данные."
            )
        
        from app.services import get_password_hash
        
        users_created = 0
        
        # Проверяем/создаём Admin
        admin_user = db.query(UserModel).filter(UserModel.username == "admin").first()
        if not admin_user:
            admin_user = UserModel(
                username="admin",
                password_hash=get_password_hash("admin"),
                full_name="Admin User",
                role=UserRole.ADMIN.value,
                is_active=True
            )
            db.add(admin_user)
            db.flush()
            users_created += 1
        
        # Проверяем/создаём Worker 1
        worker1 = db.query(UserModel).filter(UserModel.username == "worker1").first()
        if not worker1:
            worker1 = UserModel(
                username="worker1",
                password_hash=get_password_hash("worker1"),
                full_name="Иван Полевой",
                role=UserRole.WORKER.value,
                is_active=True
            )
            db.add(worker1)
            db.flush()
            users_created += 1
        
        # Проверяем/создаём Worker 2
        worker2 = db.query(UserModel).filter(UserModel.username == "worker2").first()
        if not worker2:
            worker2 = UserModel(
                username="worker2",
                password_hash=get_password_hash("worker2"),
                full_name="Анна Сервисная",
                role=UserRole.WORKER.value,
                is_active=True
            )
            db.add(worker2)
            db.flush()
            users_created += 1
        
        # Создаём тестовые заявки
        now = datetime.now(timezone.utc)
        
        test_tasks = [
            TaskModel(
                task_number="FW-0001",
                title="Аварийная протечка",
                raw_address="СПб, Невский проспект, 1",
                description="Срочная заявка на устранение протечки в санузле.",
                lat=59.935,
                lon=30.325,
                status="NEW",
                priority=TaskPriority.EMERGENCY.value,
                assigned_user_id=worker1.id,
                is_remote=False,
                is_paid=True,
                payment_amount=2500.0,
                created_at=now,
                updated_at=now
            ),
            TaskModel(
                task_number="FW-0002",
                title="Проверка отопления",
                raw_address="Москва, Красная площадь, 1",
                description="Плановая проверка системы отопления.",
                lat=55.754,
                lon=37.620,
                status="IN_PROGRESS",
                priority=TaskPriority.CURRENT.value,
                assigned_user_id=worker2.id,
                is_remote=False,
                is_paid=True,
                payment_amount=1800.0,
                created_at=now - timedelta(days=1),
                updated_at=now
            ),
            TaskModel(
                task_number="FW-0003",
                title="Консультация по телефону",
                raw_address="Удалённо",
                description="Техническая консультация по видеосвязи.",
                lat=None,
                lon=None,
                status="DONE",
                priority=TaskPriority.CURRENT.value,
                assigned_user_id=worker1.id,
                is_remote=True,
                is_paid=False,
                payment_amount=None,
                created_at=now - timedelta(days=2),
                updated_at=now - timedelta(hours=1)
            ),
            TaskModel(
                task_number="FW-0004",
                title="Ремонт окна",
                raw_address="Казань, ул. Ленина, 42",
                description="Замена разбитого стеклопакета.",
                lat=55.796,
                lon=49.108,
                status="NEW",
                priority=TaskPriority.PLANNED.value,
                assigned_user_id=None,
                is_remote=False,
                is_paid=True,
                payment_amount=3200.0,
                created_at=now - timedelta(hours=2),
                updated_at=now - timedelta(hours=2)
            ),
            TaskModel(
                task_number="FW-0005",
                title="Замена дверного замка",
                raw_address="СПб, Лиговский проспект, 120",
                description="Установка нового замка и личинки.",
                lat=59.930,
                lon=30.340,
                status="DONE",
                priority=TaskPriority.CURRENT.value,
                assigned_user_id=worker2.id,
                is_remote=False,
                is_paid=True,
                payment_amount=1500.0,
                created_at=now - timedelta(days=3),
                updated_at=now - timedelta(days=2)
            ),
        ]
        
        for task in test_tasks:
            db.add(task)
        
        db.commit()
        
        return {
            "status": "ok",
            "message": "Тестовые данные загружены успешно",
            "users_created": users_created,
            "tasks_created": len(test_tasks)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки данных: {str(e)}")


# ============================================================================
# Database Tools
# ============================================================================

@router.get("/db/stats")
async def get_database_stats(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить детальную статистику БД"""
    try:
        from app.models import TaskPhotoModel, AddressModel, NotificationModel
        
        # Get DB file size
        db_url = settings.DATABASE_URL
        db_path = None
        db_size = 0
        
        if db_url.startswith("sqlite"):
            db_path = db_url.replace("sqlite:///", "")
            if db_path.startswith("./"):
                db_path = db_path[2:]
            
            if not os.path.isabs(db_path):
                db_path = os.path.join(settings.BASE_DIR, db_path)
        
            if os.path.exists(db_path):
                db_size = os.path.getsize(db_path)
        
        # Count records in all tables
        tasks_count = db.query(TaskModel).count()
        users_count = db.query(UserModel).count()
        comments_count = db.query(CommentModel).count()
        devices_count = db.query(DeviceModel).count()
        
        # Try optional tables
        photos_count = 0
        addresses_count = 0
        notifications_count = 0
        
        try:
            photos_count = db.query(TaskPhotoModel).count()
        except:
            pass
        try:
            addresses_count = db.query(AddressModel).count()
        except:
            pass
        try:
            notifications_count = db.query(NotificationModel).count()
        except:
            pass
        
        # Task stats by status
        tasks_new = db.query(TaskModel).filter(TaskModel.status == "NEW").count()
        tasks_in_progress = db.query(TaskModel).filter(TaskModel.status == "IN_PROGRESS").count()
        tasks_done = db.query(TaskModel).filter(TaskModel.status == "DONE").count()
        tasks_cancelled = db.query(TaskModel).filter(TaskModel.status == "CANCELLED").count()
        
        # Last activity
        last_task = db.query(TaskModel).order_by(TaskModel.updated_at.desc()).first()
        last_activity = last_task.updated_at.isoformat() if last_task else None
        
        # Backup count
        backup_count = 0
        if os.path.exists(BACKUP_DIR):
            backup_count = len([f for f in os.listdir(BACKUP_DIR) if f.endswith('.gz')])
        
        return {
            "database": {
                "type": "SQLite" if settings.is_sqlite else "PostgreSQL",
                "path": db_path,
                "size_bytes": db_size,
                "size_mb": round(db_size / (1024 * 1024), 2) if db_size else 0,
            },
            "tables": {
                "tasks": tasks_count,
                "users": users_count,
                "comments": comments_count,
                "devices": devices_count,
                "photos": photos_count,
                "addresses": addresses_count,
                "notifications": notifications_count,
            },
            "tasks_by_status": {
                "new": tasks_new,
                "in_progress": tasks_in_progress,
                "done": tasks_done,
                "cancelled": tasks_cancelled,
            },
            "last_activity": last_activity,
            "backups_count": backup_count,
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/db/integrity")
async def check_database_integrity(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Проверить целостность БД (PRAGMA integrity_check)"""
    try:
        if not settings.is_sqlite:
            raise HTTPException(status_code=400, detail="Integrity check is only supported for SQLite")
        
        result = db.execute(text("PRAGMA integrity_check")).fetchall()
        
        # Result should be [('ok',)] if everything is fine
        is_ok = len(result) == 1 and result[0][0] == "ok"
        
        return {
            "status": "ok" if is_ok else "error",
            "integrity": "passed" if is_ok else "failed",
            "details": [row[0] for row in result] if not is_ok else None,
            "message": "База данных в порядке" if is_ok else "Обнаружены проблемы целостности"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/db/cleanup")
async def cleanup_old_data(
    days: int = 90,
    include_done: bool = True,
    include_cancelled: bool = True,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Удалить старые заявки (старше N дней).
    
    - days: количество дней (по умолчанию 90)
    - include_done: удалять выполненные заявки
    - include_cancelled: удалять отменённые заявки
    """
    try:
        from app.models import TaskPhotoModel
        
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Build status filter
        statuses = []
        if include_done:
            statuses.append("DONE")
        if include_cancelled:
            statuses.append("CANCELLED")
        
        if not statuses:
            return {
                "status": "ok",
                "message": "Не выбраны статусы для удаления",
                "deleted_tasks": 0,
                "deleted_comments": 0,
                "deleted_photos": 0
            }
        
        # Find old tasks
        old_tasks = db.query(TaskModel).filter(
            TaskModel.status.in_(statuses),
            TaskModel.updated_at < cutoff_date
        ).all()
        
        task_ids = [t.id for t in old_tasks]
        
        if not task_ids:
            return {
                "status": "ok",
                "message": f"Нет заявок старше {days} дней для удаления",
                "deleted_tasks": 0,
                "deleted_comments": 0,
                "deleted_photos": 0
            }
        
        # Delete related data
        deleted_comments = db.query(CommentModel).filter(
            CommentModel.task_id.in_(task_ids)
        ).delete(synchronize_session=False)
        
        deleted_photos = 0
        try:
            # Get photo paths to delete files
            photos = db.query(TaskPhotoModel).filter(
                TaskPhotoModel.task_id.in_(task_ids)
            ).all()
            
            for photo in photos:
                photo_path = settings.PHOTOS_DIR / photo.filename
                if photo_path.exists():
                    photo_path.unlink()
            
            deleted_photos = db.query(TaskPhotoModel).filter(
                TaskPhotoModel.task_id.in_(task_ids)
            ).delete(synchronize_session=False)
        except:
            pass  # Photos table might not exist
        
        # Delete tasks
        deleted_tasks = db.query(TaskModel).filter(
            TaskModel.id.in_(task_ids)
        ).delete(synchronize_session=False)
        
        db.commit()
        
        return {
            "status": "ok",
            "message": f"Удалены заявки старше {days} дней",
            "deleted_tasks": deleted_tasks,
            "deleted_comments": deleted_comments,
            "deleted_photos": deleted_photos
        }
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/db/vacuum")
async def vacuum_database(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Оптимизировать БД (VACUUM)"""
    try:
        # SQLAlchemy connection - используем text() для сырых SQL
        db.execute(text("VACUUM"))
        db.commit()
        
        return {
            "status": "ok",
            "message": "Database vacuumed successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vacuum failed: {str(e)}")


@router.post("/db/optimize")
async def optimize_database(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Оптимизировать индексы БД"""
    try:
        # Анализируем таблицы для оптимизации
        db.execute(text("ANALYZE"))
        
        # Дефрагментация (VACUUM)
        db.execute(text("VACUUM"))
        db.commit()
        
        return {
            "status": "ok",
            "message": "Database optimized successfully (ANALYZE + VACUUM)"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


@router.post("/db/restore/{backup_filename}")
async def restore_from_backup(
    backup_filename: str,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Восстановить БД из резервной копии"""
    try:
        db_url = settings.DATABASE_URL
        if not db_url.startswith("sqlite"):
            raise HTTPException(status_code=400, detail="Restore is only supported for SQLite")
        
        # Extract path from sqlite:///./tasks.db
        db_path = db_url.replace("sqlite:///", "")
        if db_path.startswith("./"):
            db_path = db_path[2:]
        
        if not os.path.isabs(db_path):
            db_path = os.path.join(settings.BASE_DIR.parent, db_path)
        
        # Validate backup filename (prevent directory traversal)
        if ".." in backup_filename or "/" in backup_filename or "\\" in backup_filename:
            raise HTTPException(status_code=400, detail="Invalid backup filename")
        
        backup_path = os.path.join(BACKUP_DIR, backup_filename)
        
        if not os.path.exists(backup_path):
            raise HTTPException(status_code=404, detail="Backup file not found")
        
        # Close all DB connections
        db.close()
        db.connection().close()
        
        # Restore from backup
        try:
            with gzip.open(backup_path, "rb") as f_in:
                with open(db_path, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")
        
        return {
            "status": "ok",
            "message": f"Database restored from {backup_filename}",
            "warning": "Server needs restart to reload the database"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/db/backup/{backup_filename}")
async def delete_backup(
    backup_filename: str,
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить резервную копию"""
    try:
        # Validate filename
        if ".." in backup_filename or "/" in backup_filename or "\\" in backup_filename:
            raise HTTPException(status_code=400, detail="Invalid backup filename")
        
        backup_path = os.path.join(BACKUP_DIR, backup_filename)
        
        if not os.path.exists(backup_path):
            raise HTTPException(status_code=404, detail="Backup file not found")
        
        os.remove(backup_path)
        
        return {
            "status": "ok",
            "message": f"Backup {backup_filename} deleted"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tasks")
async def delete_all_tasks(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить все заявки"""
    try:
        # Delete comments first (foreign key constraint)
        db.query(CommentModel).delete()
        
        # Then delete tasks
        db.query(TaskModel).delete()
        
        db.commit()
        
        return {
            "status": "ok",
            "message": "All tasks and comments deleted"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
