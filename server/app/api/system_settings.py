"""
System Settings API
===================
API для управления системными настройками, кастомными полями и разрешениями.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.models import (
    get_db, UserModel,
    SystemSettingModel, CustomFieldModel, CustomFieldValueModel, RolePermissionModel,
    get_setting, set_setting, get_all_settings, get_settings_by_group, init_default_settings
)
from app.services import get_current_admin


router = APIRouter(prefix="/api/admin", tags=["System Settings"])


# ============================================
# Pydantic Schemas (только локальные, не дублируются в schemas/)
# ============================================

class DefectTypeResponse(BaseModel):
    """Ответ с типом неисправности"""
    id: str
    name: str
    description: Optional[str] = None
    system_types: Optional[List[str]] = None  # Типы систем для которых применим этот тип неисправности


class DefectTypeCreate(BaseModel):
    """Создание типа неисправности"""
    name: str
    description: Optional[str] = None
    system_types: Optional[List[str]] = None  # Типы систем для которых применим этот тип неисправности


class SettingResponse(BaseModel):
    """Ответ с настройкой"""
    key: str
    value: Any
    value_type: str
    group: str
    label: str
    description: Optional[str]
    options: Optional[List[dict]]
    is_readonly: bool
    updated_at: Optional[datetime]


class SettingsGroupResponse(BaseModel):
    """Группа настроек"""
    group: str
    label: str
    icon: str
    settings: List[SettingResponse]


class LocalSettingUpdate(BaseModel):
    """Обновление настройки (локальная схема)"""
    value: Any


class LocalCustomFieldCreate(BaseModel):
    """Создание кастомного поля (локальная схема для этого API)"""
    name: str
    label: str
    field_type: str = "text"
    is_required: bool = False
    show_in_list: bool = False
    show_in_card: bool = True
    options: Optional[List[str]] = None
    default_value: Optional[str] = None
    placeholder: Optional[str] = None
    field_group: str = "custom"


class LocalCustomFieldResponse(BaseModel):
    """Ответ с кастомным полем (локальная схема для этого API)"""
    id: int
    name: str
    label: str
    field_type: str
    is_required: bool
    is_active: bool
    show_in_list: bool
    show_in_card: bool
    options: Optional[List[str]]
    default_value: Optional[str]
    placeholder: Optional[str]
    sort_order: int
    field_group: str


class LocalRolePermissionsUpdate(BaseModel):
    """Обновление разрешений роли (локальная схема)"""
    permissions: Dict[str, bool]


# ============================================
# Группы настроек с метаданными
# ============================================

SETTINGS_GROUPS = {
    "images": {"label": "Изображения", "icon": "bi-image"},
    "backup": {"label": "Резервное копирование", "icon": "bi-cloud-arrow-up"},
    "notifications": {"label": "Уведомления", "icon": "bi-bell"},
    "security": {"label": "Безопасность", "icon": "bi-shield-lock"},
    "interface": {"label": "Интерфейс", "icon": "bi-layout-text-window"},
    "server": {"label": "Сервер", "icon": "bi-server"},
}


# ============================================
# System Settings Endpoints
# ============================================

@router.get("/settings", response_model=List[SettingsGroupResponse])
async def get_system_settings(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить все системные настройки, сгруппированные"""
    # Инициализируем настройки если не существуют
    init_default_settings(db)
    
    settings = get_all_settings(db)
    
    # Группируем по group
    groups_dict = {}
    for setting in settings:
        if setting.group not in groups_dict:
            group_meta = SETTINGS_GROUPS.get(setting.group, {"label": setting.group, "icon": "bi-gear"})
            groups_dict[setting.group] = {
                "group": setting.group,
                "label": group_meta["label"],
                "icon": group_meta["icon"],
                "settings": []
            }
        
        groups_dict[setting.group]["settings"].append(SettingResponse(
            key=setting.key,
            value=setting.get_typed_value(),
            value_type=setting.value_type,
            group=setting.group,
            label=setting.label,
            description=setting.description,
            options=setting.options,
            is_readonly=setting.is_readonly,
            updated_at=setting.updated_at
        ))
    
    return list(groups_dict.values())


@router.get("/settings/{key}")
async def get_single_setting(
    key: str,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить одну настройку"""
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Настройка не найдена")
    
    return SettingResponse(
        key=setting.key,
        value=setting.get_typed_value(),
        value_type=setting.value_type,
        group=setting.group,
        label=setting.label,
        description=setting.description,
        options=setting.options,
        is_readonly=setting.is_readonly,
        updated_at=setting.updated_at
    )


@router.put("/settings/{key}")
async def update_setting(
    key: str,
    data: LocalSettingUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Обновить настройку"""
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Настройка не найдена")
    
    if setting.is_readonly:
        raise HTTPException(status_code=400, detail="Настройка только для чтения")
    
    setting.set_typed_value(data.value)
    setting.updated_by = admin.username
    db.commit()
    
    return {"status": "ok", "key": key, "value": setting.get_typed_value()}


@router.post("/settings/bulk")
async def update_settings_bulk(
    updates: Dict[str, Any],
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Массовое обновление настроек"""
    updated = []
    errors = []
    
    for key, value in updates.items():
        setting = db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
        if not setting:
            errors.append(f"Настройка '{key}' не найдена")
            continue
        
        if setting.is_readonly:
            errors.append(f"Настройка '{key}' только для чтения")
            continue
        
        setting.set_typed_value(value)
        setting.updated_by = admin.username
        updated.append(key)
    
    db.commit()
    
    return {
        "status": "ok",
        "updated": updated,
        "errors": errors
    }


# ============================================
# Custom Fields Endpoints
# ============================================

@router.get("/custom-fields", response_model=List[LocalCustomFieldResponse])
async def get_custom_fields(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить все кастомные поля"""
    fields = db.query(CustomFieldModel).order_by(
        CustomFieldModel.sort_order,
        CustomFieldModel.id
    ).all()
    
    return [
        LocalCustomFieldResponse(
            id=f.id,
            name=f.name,
            label=f.label,
            field_type=f.field_type,
            is_required=f.is_required,
            is_active=f.is_active,
            show_in_list=f.show_in_list,
            show_in_card=f.show_in_card,
            options=f.options,
            default_value=f.default_value,
            placeholder=f.placeholder,
            sort_order=f.sort_order,
            field_group=f.field_group
        )
        for f in fields
    ]


@router.post("/custom-fields", response_model=LocalCustomFieldResponse)
async def create_custom_field(
    data: LocalCustomFieldCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Создать кастомное поле"""
    # Проверяем уникальность имени
    existing = db.query(CustomFieldModel).filter(CustomFieldModel.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Поле с таким именем уже существует")
    
    # Получаем максимальный sort_order
    max_order = db.query(CustomFieldModel).count()
    
    field = CustomFieldModel(
        name=data.name,
        label=data.label,
        field_type=data.field_type,
        is_required=data.is_required,
        show_in_list=data.show_in_list,
        show_in_card=data.show_in_card,
        options=data.options,
        default_value=data.default_value,
        placeholder=data.placeholder,
        field_group=data.field_group,
        sort_order=max_order + 1
    )
    
    db.add(field)
    db.commit()
    db.refresh(field)
    
    return LocalCustomFieldResponse(
        id=field.id,
        name=field.name,
        label=field.label,
        field_type=field.field_type,
        is_required=field.is_required,
        is_active=field.is_active,
        show_in_list=field.show_in_list,
        show_in_card=field.show_in_card,
        options=field.options,
        default_value=field.default_value,
        placeholder=field.placeholder,
        sort_order=field.sort_order,
        field_group=field.field_group
    )


@router.put("/custom-fields/{field_id}")
async def update_custom_field(
    field_id: int,
    data: LocalCustomFieldCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Обновить кастомное поле"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Поле не найдено")
    
    # Проверяем уникальность имени (исключая текущее поле)
    existing = db.query(CustomFieldModel).filter(
        CustomFieldModel.name == data.name,
        CustomFieldModel.id != field_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Поле с таким именем уже существует")
    
    field.name = data.name
    field.label = data.label
    field.field_type = data.field_type
    field.is_required = data.is_required
    field.show_in_list = data.show_in_list
    field.show_in_card = data.show_in_card
    field.options = data.options
    field.default_value = data.default_value
    field.placeholder = data.placeholder
    field.field_group = data.field_group
    
    db.commit()
    
    return {"status": "ok", "id": field_id}


@router.delete("/custom-fields/{field_id}")
async def delete_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить кастомное поле"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Поле не найдено")
    
    # Удаляем все значения этого поля
    db.query(CustomFieldValueModel).filter(CustomFieldValueModel.field_id == field_id).delete()
    
    db.delete(field)
    db.commit()
    
    return {"status": "ok"}


@router.put("/custom-fields/{field_id}/toggle")
async def toggle_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Включить/выключить кастомное поле"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Поле не найдено")
    
    field.is_active = not field.is_active
    db.commit()
    
    return {"status": "ok", "is_active": field.is_active}


# ============================================
# Role Permissions Endpoints
# ============================================

@router.get("/permissions")
async def get_all_permissions(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить все разрешения по ролям"""
    # Инициализируем если не существуют
    init_default_settings(db)
    
    permissions = db.query(RolePermissionModel).all()
    
    # Группируем по ролям
    result = {}
    for perm in permissions:
        if perm.role not in result:
            result[perm.role] = {}
        result[perm.role][perm.permission] = perm.is_allowed
    
    return result


@router.put("/permissions/{role}")
async def update_role_permissions(
    role: str,
    data: LocalRolePermissionsUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Обновить разрешения для роли"""
    if role not in ["admin", "dispatcher", "worker"]:
        raise HTTPException(status_code=400, detail="Неизвестная роль")
    
    if role == "admin":
        raise HTTPException(status_code=400, detail="Нельзя изменять разрешения администратора")
    
    for permission, is_allowed in data.permissions.items():
        perm = db.query(RolePermissionModel).filter(
            RolePermissionModel.role == role,
            RolePermissionModel.permission == permission
        ).first()
        
        if perm:
            perm.is_allowed = is_allowed
        else:
            perm = RolePermissionModel(
                role=role,
                permission=permission,
                is_allowed=is_allowed
            )
            db.add(perm)
    
    db.commit()
    
    return {"status": "ok", "role": role}


# ============================================
# Backup Endpoints
# ============================================

@router.post("/backup/run")
async def run_backup(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Запустить резервное копирование вручную"""
    import subprocess
    import sys
    from pathlib import Path
    
    script_path = Path(__file__).resolve().parent.parent.parent / "scripts" / "backup_db.py"
    
    # Получаем настройки
    include_photos = get_setting(db, "backup_include_photos", False)
    retention_days = get_setting(db, "backup_retention_days", 7)
    
    cmd = [sys.executable, str(script_path), f"--keep={retention_days}"]
    if include_photos:
        cmd.append("--with-photos")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0:
            return {
                "status": "ok",
                "message": "Бэкап успешно создан",
                "output": result.stdout
            }
        else:
            return {
                "status": "error",
                "message": "Ошибка создания бэкапа",
                "output": result.stderr
            }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Таймаут создания бэкапа")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backup/list")
async def list_backups(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить список бэкапов"""
    from pathlib import Path
    from app.config import settings
    
    backup_dir = settings.BASE_DIR / "backups"
    
    if not backup_dir.exists():
        return {"backups": []}
    
    backups = []
    for f in backup_dir.glob("tasks_db_*"):
        stat = f.stat()
        backups.append({
            "name": f.name,
            "size": stat.st_size,
            "created": datetime.fromtimestamp(stat.st_mtime).isoformat()
        })
    
    # Сортируем по дате (новые первыми)
    backups.sort(key=lambda x: x["created"], reverse=True)
    
    return {"backups": backups}


# ============================================
# Defect Types API
# ============================================

@router.get("/settings/defect-types/list", response_model=List[DefectTypeResponse])
async def get_defect_types(
    db: Session = Depends(get_db),
):
    """Получить список типов неисправностей (доступно всем)"""
    # get_setting возвращает уже парсенное значение (list или None)
    types_data = get_setting(db, "defect_types")
    
    if not types_data:
        return []
    
    try:
        return [DefectTypeResponse(**t) for t in types_data]
    except (ValueError, TypeError):
        return []


@router.post("/settings/defect-types/add", response_model=DefectTypeResponse)
async def add_defect_type(
    data: DefectTypeCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Добавить новый тип неисправности (только админы)"""
    import json
    import uuid
    
    # get_setting возвращает уже парсенное значение (list или None)
    types_data = get_setting(db, "defect_types")
    if not types_data:
        types_data = []
    
    # Создаём новый тип
    new_type = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "description": data.description,
        "system_types": data.system_types or []
    }
    
    types_data.append(new_type)
    
    # Сохраняем обновленный список
    set_setting(db, "defect_types", json.dumps(types_data, ensure_ascii=False))
    
    return DefectTypeResponse(**new_type)


@router.delete("/settings/defect-types/{defect_type_id}")
async def delete_defect_type(
    defect_type_id: str,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить тип неисправности (только админы)"""
    import json
    
    # get_setting возвращает уже парсенное значение (list или None)
    types_data = get_setting(db, "defect_types")
    
    if not types_data:
        raise HTTPException(status_code=404, detail="Тип не найден")
    
    # Ищем и удаляем тип
    original_len = len(types_data)
    types_data = [t for t in types_data if t.get("id") != defect_type_id]
    
    if len(types_data) == original_len:
        raise HTTPException(status_code=404, detail="Тип не найден")
    
    # Сохраняем обновленный список
    set_setting(db, "defect_types", json.dumps(types_data, ensure_ascii=False))
    
    return {"status": "deleted"}
