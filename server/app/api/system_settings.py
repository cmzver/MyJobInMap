"""
System Settings API
===================
API для управления системными настройками и типами дефектов.
Custom Fields, Permissions и Backups — см. admin.py.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import (SystemSettingModel, UserModel, get_all_settings,
                        get_db, get_setting, init_default_settings,
                        set_setting)
from app.services import get_current_admin, get_current_superadmin

router = APIRouter(prefix="/api/admin", tags=["System Settings"])
public_router = APIRouter(prefix="/api/public", tags=["Public Settings"])


# ============================================
# Pydantic Schemas (только локальные, не дублируются в schemas/)
# ============================================


class DefectTypeResponse(BaseModel):
    """Ответ с типом неисправности"""

    id: str
    name: str
    description: Optional[str] = None
    system_types: Optional[List[str]] = (
        None  # Типы систем для которых применим этот тип неисправности
    )


class DefectTypeCreate(BaseModel):
    """Создание типа неисправности"""

    name: str
    description: Optional[str] = None
    system_types: Optional[List[str]] = (
        None  # Типы систем для которых применим этот тип неисправности
    )


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


class InterfaceSettingsResponse(BaseModel):
    """Публичные настройки интерфейса"""

    enable_resizable_columns: bool
    compact_table_view: bool


class LoginBrandingResponse(BaseModel):
    """��������� ��������� ��������� � ����� ��������� ��� ������ �����."""

    appName: str
    productLabel: str
    headline: str
    description: str
    organizationName: Optional[str] = None
    supportEmail: Optional[str] = None
    supportPhone: Optional[str] = None
    supportHours: str


class LocalSettingUpdate(BaseModel):
    """Обновление настройки (локальная схема)"""

    value: Any


# ============================================
# Группы настроек с метаданными
# ============================================

SETTINGS_GROUPS = {
    "images": {"label": "Изображения", "icon": "bi-image"},
    "backup": {"label": "Резервное копирование", "icon": "bi-cloud-arrow-up"},
    "notifications": {"label": "Уведомления", "icon": "bi-bell"},
    "security": {"label": "Безопасность", "icon": "bi-shield-lock"},
    "interface": {"label": "Интерфейс", "icon": "bi-layout-text-window"},
    "branding": {"label": "Брендинг", "icon": "bi-palette"},
    "server": {"label": "Сервер", "icon": "bi-server"},
}


def _clean_optional_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _build_login_branding_response(db: Session) -> LoginBrandingResponse:
    init_default_settings(db)

    return LoginBrandingResponse(
        appName=str(
            get_setting(db, "login_app_name", "FieldWorker") or "FieldWorker"
        ).strip(),
        productLabel=str(
            get_setting(db, "login_product_label", "Field Service Platform")
            or "Field Service Platform"
        ).strip(),
        headline=str(
            get_setting(db, "login_headline", "���������� ���� � ������� ������������")
            or "���������� ���� � ������� ������������"
        ).strip(),
        description=str(
            get_setting(
                db,
                "login_description",
                "������ ����������� ��� ���������������, ����������� � ������������ � tenant-��������� �� ������������.",
            )
            or "������ ����������� ��� ���������������, ����������� � ������������ � tenant-��������� �� ������������."
        ).strip(),
        organizationName=_clean_optional_string(
            get_setting(db, "login_organization_name", None)
        ),
        supportEmail=_clean_optional_string(get_setting(db, "support_email", None)),
        supportPhone=_clean_optional_string(get_setting(db, "support_phone", None)),
        supportHours=str(
            get_setting(db, "support_hours", "��-��, 09:00-18:00")
            or "��-��, 09:00-18:00"
        ).strip(),
    )


# ============================================
# System Settings Endpoints
# ============================================


@router.get("/settings", response_model=List[SettingsGroupResponse])
async def get_system_settings(
    db: Session = Depends(get_db), admin: UserModel = Depends(get_current_superadmin)
):
    """Получить все системные настройки, сгруппированные"""
    # Инициализируем настройки если не существуют
    init_default_settings(db)

    settings = get_all_settings(db)

    # Группируем по group
    groups_dict = {}
    for setting in settings:
        if setting.group not in groups_dict:
            group_meta = SETTINGS_GROUPS.get(
                setting.group, {"label": setting.group, "icon": "bi-gear"}
            )
            groups_dict[setting.group] = {
                "group": setting.group,
                "label": group_meta["label"],
                "icon": group_meta["icon"],
                "settings": [],
            }

        groups_dict[setting.group]["settings"].append(
            SettingResponse(
                key=setting.key,
                value=setting.get_typed_value(),
                value_type=setting.value_type,
                group=setting.group,
                label=setting.label,
                description=setting.description,
                options=setting.options,
                is_readonly=setting.is_readonly,
                updated_at=setting.updated_at,
            )
        )

    return list(groups_dict.values())


@router.get("/settings/interface", response_model=InterfaceSettingsResponse)
async def get_interface_settings(db: Session = Depends(get_db)):
    """Получить публичные настройки интерфейса"""
    init_default_settings(db)
    enable_resizable_columns = get_setting(db, "enable_resizable_columns")
    compact_table_view = get_setting(db, "compact_table_view")
    if enable_resizable_columns is None:
        enable_resizable_columns = True
    if compact_table_view is None:
        compact_table_view = False

    return InterfaceSettingsResponse(
        enable_resizable_columns=bool(enable_resizable_columns),
        compact_table_view=bool(compact_table_view),
    )


@public_router.get("/login-branding", response_model=LoginBrandingResponse)
async def get_login_branding_settings(db: Session = Depends(get_db)):
    """�������� ��������� ��������� ��������� � ����� ��������� ��� �������� �����."""
    return _build_login_branding_response(db)


# ============================================
# Defect Types API
# ============================================


@router.get("/settings/defect-types", response_model=List[DefectTypeResponse])
async def get_defect_types(
    db: Session = Depends(get_db),
):
    """Получить список типов неисправностей (доступно всем)"""
    init_default_settings(db)

    # get_setting возвращает уже парсенное значение (list или None)
    types_data = get_setting(db, "defect_types")

    if not types_data:
        return []

    try:
        return [DefectTypeResponse(**t) for t in types_data]
    except (ValueError, TypeError):
        return []


@router.post("/settings/defect-types", response_model=DefectTypeResponse)
async def add_defect_type(
    data: DefectTypeCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
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
        "system_types": data.system_types or [],
    }

    types_data.append(new_type)

    # Сохраняем обновленный список
    set_setting(db, "defect_types", json.dumps(types_data, ensure_ascii=False))

    return DefectTypeResponse(**new_type)


@router.delete("/settings/defect-types/{defect_type_id}")
async def delete_defect_type(
    defect_type_id: str,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
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


@router.get("/settings/{key}")
async def get_single_setting(
    key: str,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Получить одну настройку"""
    init_default_settings(db)
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
        updated_at=setting.updated_at,
    )


@router.patch("/settings/{key}")
async def update_setting(
    key: str,
    data: LocalSettingUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Обновить настройку"""
    init_default_settings(db)
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Настройка не найдена")

    if setting.is_readonly:
        raise HTTPException(status_code=400, detail="Настройка только для чтения")

    setting.set_typed_value(data.value)
    setting.updated_by = admin.username
    db.commit()

    return {"status": "ok", "key": key, "value": setting.get_typed_value()}


@router.patch("/settings")
async def update_settings_bulk(
    updates: Dict[str, Any],
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Массовое обновление настроек"""
    init_default_settings(db)
    updated = []
    errors = []

    for key, value in updates.items():
        setting = (
            db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
        )
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

    return {"status": "ok", "updated": updated, "errors": errors}
