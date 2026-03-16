"""
System Settings API
===================
API РґР»СЏ СѓРїСЂР°РІР»РµРЅРёСЏ СЃРёСЃС‚РµРјРЅС‹РјРё РЅР°СЃС‚СЂРѕР№РєР°РјРё Рё С‚РёРїР°РјРё РґРµС„РµРєС‚РѕРІ.
Custom Fields, Permissions Рё Backups вЂ” СЃРј. admin.py.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.models import (
    get_db, UserModel,
    SystemSettingModel,
    get_setting, set_setting, get_all_settings, init_default_settings
)
from app.services import get_current_admin, get_current_superadmin


router = APIRouter(prefix="/api/admin", tags=["System Settings"])
public_router = APIRouter(prefix="/api/public", tags=["Public Settings"])


# ============================================
# Pydantic Schemas (С‚РѕР»СЊРєРѕ Р»РѕРєР°Р»СЊРЅС‹Рµ, РЅРµ РґСѓР±Р»РёСЂСѓСЋС‚СЃСЏ РІ schemas/)
# ============================================

class DefectTypeResponse(BaseModel):
    """РћС‚РІРµС‚ СЃ С‚РёРїРѕРј РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё"""
    id: str
    name: str
    description: Optional[str] = None
    system_types: Optional[List[str]] = None  # РўРёРїС‹ СЃРёСЃС‚РµРј РґР»СЏ РєРѕС‚РѕСЂС‹С… РїСЂРёРјРµРЅРёРј СЌС‚РѕС‚ С‚РёРї РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё


class DefectTypeCreate(BaseModel):
    """РЎРѕР·РґР°РЅРёРµ С‚РёРїР° РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё"""
    name: str
    description: Optional[str] = None
    system_types: Optional[List[str]] = None  # РўРёРїС‹ СЃРёСЃС‚РµРј РґР»СЏ РєРѕС‚РѕСЂС‹С… РїСЂРёРјРµРЅРёРј СЌС‚РѕС‚ С‚РёРї РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё


class SettingResponse(BaseModel):
    """РћС‚РІРµС‚ СЃ РЅР°СЃС‚СЂРѕР№РєРѕР№"""
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
    """Р“СЂСѓРїРїР° РЅР°СЃС‚СЂРѕРµРє"""
    group: str
    label: str
    icon: str
    settings: List[SettingResponse]


class InterfaceSettingsResponse(BaseModel):
    """РџСѓР±Р»РёС‡РЅС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё РёРЅС‚РµСЂС„РµР№СЃР°"""
    enable_resizable_columns: bool
    compact_table_view: bool


class LoginBrandingResponse(BaseModel):
    """Публичные настройки брендинга и блока поддержки для экрана входа."""
    appName: str
    productLabel: str
    headline: str
    description: str
    organizationName: Optional[str] = None
    supportEmail: Optional[str] = None
    supportPhone: Optional[str] = None
    supportHours: str


class LocalSettingUpdate(BaseModel):
    """РћР±РЅРѕРІР»РµРЅРёРµ РЅР°СЃС‚СЂРѕР№РєРё (Р»РѕРєР°Р»СЊРЅР°СЏ СЃС…РµРјР°)"""
    value: Any


# ============================================
# Р“СЂСѓРїРїС‹ РЅР°СЃС‚СЂРѕРµРє СЃ РјРµС‚Р°РґР°РЅРЅС‹РјРё
# ============================================

SETTINGS_GROUPS = {
    "images": {"label": "РР·РѕР±СЂР°Р¶РµРЅРёСЏ", "icon": "bi-image"},
    "backup": {"label": "Р РµР·РµСЂРІРЅРѕРµ РєРѕРїРёСЂРѕРІР°РЅРёРµ", "icon": "bi-cloud-arrow-up"},
    "notifications": {"label": "РЈРІРµРґРѕРјР»РµРЅРёСЏ", "icon": "bi-bell"},
    "security": {"label": "Р‘РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ", "icon": "bi-shield-lock"},
    "interface": {"label": "РРЅС‚РµСЂС„РµР№СЃ", "icon": "bi-layout-text-window"},
    "branding": {"label": "Р‘СЂРµРЅРґРёРЅРі", "icon": "bi-palette"},
    "server": {"label": "РЎРµСЂРІРµСЂ", "icon": "bi-server"},
}


def _clean_optional_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _build_login_branding_response(db: Session) -> LoginBrandingResponse:
    init_default_settings(db)

    return LoginBrandingResponse(
        appName=str(get_setting(db, "login_app_name", "FieldWorker") or "FieldWorker").strip(),
        productLabel=str(get_setting(db, "login_product_label", "Field Service Platform") or "Field Service Platform").strip(),
        headline=str(get_setting(db, "login_headline", "Защищённый вход в рабочее пространство") or "Защищённый вход в рабочее пространство").strip(),
        description=str(
            get_setting(
                db,
                "login_description",
                "Единая авторизация для администраторов, диспетчеров и исполнителей с tenant-изоляцией по организациям.",
            )
            or "Единая авторизация для администраторов, диспетчеров и исполнителей с tenant-изоляцией по организациям."
        ).strip(),
        organizationName=_clean_optional_string(get_setting(db, "login_organization_name", None)),
        supportEmail=_clean_optional_string(get_setting(db, "support_email", None)),
        supportPhone=_clean_optional_string(get_setting(db, "support_phone", None)),
        supportHours=str(get_setting(db, "support_hours", "Пн-Пт, 09:00-18:00") or "Пн-Пт, 09:00-18:00").strip(),
    )


# ============================================
# System Settings Endpoints
# ============================================

@router.get("/settings", response_model=List[SettingsGroupResponse])
async def get_system_settings(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin)
):
    """РџРѕР»СѓС‡РёС‚СЊ РІСЃРµ СЃРёСЃС‚РµРјРЅС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё, СЃРіСЂСѓРїРїРёСЂРѕРІР°РЅРЅС‹Рµ"""
    # РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј РЅР°СЃС‚СЂРѕР№РєРё РµСЃР»Рё РЅРµ СЃСѓС‰РµСЃС‚РІСѓСЋС‚
    init_default_settings(db)
    
    settings = get_all_settings(db)
    
    # Р“СЂСѓРїРїРёСЂСѓРµРј РїРѕ group
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


@router.get("/settings/interface", response_model=InterfaceSettingsResponse)
async def get_interface_settings(db: Session = Depends(get_db)):
    """РџРѕР»СѓС‡РёС‚СЊ РїСѓР±Р»РёС‡РЅС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё РёРЅС‚РµСЂС„РµР№СЃР°"""
    init_default_settings(db)
    enable_resizable_columns = get_setting(db, "enable_resizable_columns")
    compact_table_view = get_setting(db, "compact_table_view")
    if enable_resizable_columns is None:
        enable_resizable_columns = True
    if compact_table_view is None:
        compact_table_view = False

    return InterfaceSettingsResponse(
        enable_resizable_columns=bool(enable_resizable_columns),
        compact_table_view=bool(compact_table_view)
    )


@public_router.get("/login-branding", response_model=LoginBrandingResponse)
async def get_login_branding_settings(db: Session = Depends(get_db)):
    """Получить публичные настройки брендинга и блока поддержки для страницы входа."""
    return _build_login_branding_response(db)


# ============================================
# Defect Types API
# ============================================

@router.get("/settings/defect-types", response_model=List[DefectTypeResponse])
async def get_defect_types(
    db: Session = Depends(get_db),
):
    """РџРѕР»СѓС‡РёС‚СЊ СЃРїРёСЃРѕРє С‚РёРїРѕРІ РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚РµР№ (РґРѕСЃС‚СѓРїРЅРѕ РІСЃРµРј)"""
    init_default_settings(db)

    # get_setting РІРѕР·РІСЂР°С‰Р°РµС‚ СѓР¶Рµ РїР°СЂСЃРµРЅРЅРѕРµ Р·РЅР°С‡РµРЅРёРµ (list РёР»Рё None)
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
    admin: UserModel = Depends(get_current_superadmin)
):
    """Р”РѕР±Р°РІРёС‚СЊ РЅРѕРІС‹Р№ С‚РёРї РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё (С‚РѕР»СЊРєРѕ Р°РґРјРёРЅС‹)"""
    import json
    import uuid
    
    # get_setting РІРѕР·РІСЂР°С‰Р°РµС‚ СѓР¶Рµ РїР°СЂСЃРµРЅРЅРѕРµ Р·РЅР°С‡РµРЅРёРµ (list РёР»Рё None)
    types_data = get_setting(db, "defect_types")
    if not types_data:
        types_data = []
    
    # РЎРѕР·РґР°С‘Рј РЅРѕРІС‹Р№ С‚РёРї
    new_type = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "description": data.description,
        "system_types": data.system_types or []
    }
    
    types_data.append(new_type)
    
    # РЎРѕС…СЂР°РЅСЏРµРј РѕР±РЅРѕРІР»РµРЅРЅС‹Р№ СЃРїРёСЃРѕРє
    set_setting(db, "defect_types", json.dumps(types_data, ensure_ascii=False))
    
    return DefectTypeResponse(**new_type)


@router.delete("/settings/defect-types/{defect_type_id}")
async def delete_defect_type(
    defect_type_id: str,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin)
):
    """РЈРґР°Р»РёС‚СЊ С‚РёРї РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё (С‚РѕР»СЊРєРѕ Р°РґРјРёРЅС‹)"""
    import json
    
    # get_setting РІРѕР·РІСЂР°С‰Р°РµС‚ СѓР¶Рµ РїР°СЂСЃРµРЅРЅРѕРµ Р·РЅР°С‡РµРЅРёРµ (list РёР»Рё None)
    types_data = get_setting(db, "defect_types")
    
    if not types_data:
        raise HTTPException(status_code=404, detail="РўРёРї РЅРµ РЅР°Р№РґРµРЅ")
    
    # РС‰РµРј Рё СѓРґР°Р»СЏРµРј С‚РёРї
    original_len = len(types_data)
    types_data = [t for t in types_data if t.get("id") != defect_type_id]
    
    if len(types_data) == original_len:
        raise HTTPException(status_code=404, detail="РўРёРї РЅРµ РЅР°Р№РґРµРЅ")
    
    # РЎРѕС…СЂР°РЅСЏРµРј РѕР±РЅРѕРІР»РµРЅРЅС‹Р№ СЃРїРёСЃРѕРє
    set_setting(db, "defect_types", json.dumps(types_data, ensure_ascii=False))
    
    return {"status": "deleted"}


@router.get("/settings/{key}")
async def get_single_setting(
    key: str,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin)
):
    """РџРѕР»СѓС‡РёС‚СЊ РѕРґРЅСѓ РЅР°СЃС‚СЂРѕР№РєСѓ"""
    init_default_settings(db)
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="РќР°СЃС‚СЂРѕР№РєР° РЅРµ РЅР°Р№РґРµРЅР°")
    
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


@router.patch("/settings/{key}")
async def update_setting(
    key: str,
    data: LocalSettingUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin)
):
    """РћР±РЅРѕРІРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєСѓ"""
    init_default_settings(db)
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="РќР°СЃС‚СЂРѕР№РєР° РЅРµ РЅР°Р№РґРµРЅР°")
    
    if setting.is_readonly:
        raise HTTPException(status_code=400, detail="РќР°СЃС‚СЂРѕР№РєР° С‚РѕР»СЊРєРѕ РґР»СЏ С‡С‚РµРЅРёСЏ")
    
    setting.set_typed_value(data.value)
    setting.updated_by = admin.username
    db.commit()
    
    return {"status": "ok", "key": key, "value": setting.get_typed_value()}


@router.patch("/settings")
async def update_settings_bulk(
    updates: Dict[str, Any],
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin)
):
    """РњР°СЃСЃРѕРІРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ РЅР°СЃС‚СЂРѕРµРє"""
    init_default_settings(db)
    updated = []
    errors = []
    
    for key, value in updates.items():
        setting = db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
        if not setting:
            errors.append(f"РќР°СЃС‚СЂРѕР№РєР° '{key}' РЅРµ РЅР°Р№РґРµРЅР°")
            continue
        
        if setting.is_readonly:
            errors.append(f"РќР°СЃС‚СЂРѕР№РєР° '{key}' С‚РѕР»СЊРєРѕ РґР»СЏ С‡С‚РµРЅРёСЏ")
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
