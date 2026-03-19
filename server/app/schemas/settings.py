"""
Settings Schemas
================
РЎС…РµРјС‹ РґР»СЏ СЃРёСЃС‚РµРјРЅС‹С… РЅР°СЃС‚СЂРѕРµРє, РєР°СЃС‚РѕРјРЅС‹С… РїРѕР»РµР№ Рё РїСЂР°РІ РґРѕСЃС‚СѓРїР°.
"""

from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime


# --- System Settings ---

class SystemSettingSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    key: str
    value: Union[str, int, float, bool, List, Dict]
    value_type: str  # 'string', 'int', 'bool', 'json', 'select'
    group: str
    label: str
    description: Optional[str] = None
    is_public: bool = False
    is_readonly: bool = False
    options: Optional[List[Dict[str, str]]] = None


class SettingsGroupSchema(BaseModel):
    group: str
    title: str
    settings: List[SystemSettingSchema]


class SettingUpdate(BaseModel):
    value: Union[str, int, float, bool, List, Dict]


# --- Custom Fields ---

class CustomFieldCreate(BaseModel):
    name: str = Field(..., pattern="^[a-z_][a-z0-9_]*$")
    label: str
    field_type: str = "text"  # text, textarea, number, select, checkbox, date
    options: Optional[List[str]] = None
    placeholder: Optional[str] = None
    default_value: Optional[str] = None
    is_required: bool = False
    show_in_list: bool = False
    show_in_card: bool = True


class CustomFieldUpdate(BaseModel):
    label: Optional[str] = None
    field_type: Optional[str] = None
    options: Optional[List[str]] = None
    placeholder: Optional[str] = None
    default_value: Optional[str] = None
    is_required: Optional[bool] = None
    show_in_list: Optional[bool] = None
    show_in_card: Optional[bool] = None
    is_active: Optional[bool] = None


class CustomFieldResponse(CustomFieldCreate):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    is_active: bool
    created_at: datetime


# --- Permissions ---

class RolePermissionsResponse(BaseModel):
    """РЎР»РѕРІР°СЂСЊ {role: {permission: bool}}"""
    # Dynamic dict structure due to variable roles/perms
    admin: Dict[str, bool] = {}
    dispatcher: Dict[str, bool] = {}
    worker: Dict[str, bool] = {}


class UpdateRolePermissionRequest(BaseModel):
    permissions: Dict[str, bool]


# --- Backups ---

class BackupFile(BaseModel):
    name: str
    size: int
    created: datetime


class BackupListResponse(BaseModel):
    backups: List[BackupFile]


class BackupSettingsSchema(BaseModel):
    """РќР°СЃС‚СЂРѕР№РєРё СЂРµР·РµСЂРІРЅРѕРіРѕ РєРѕРїРёСЂРѕРІР°РЅРёСЏ"""
    auto_backup: bool = True
    schedule: str = "daily"  # daily, weekly, manual
    retention_days: int = 30


class BackupSettingsResponse(BackupSettingsSchema):
    """РћС‚РІРµС‚ СЃ РЅР°СЃС‚СЂРѕР№РєР°РјРё Р±СЌРєР°РїР°"""
    pass
