"""
Settings Schemas
================
РЎС…РµРјС‹ РґР»СЏ СЃРёСЃС‚РµРјРЅС‹С… РЅР°СЃС‚СЂРѕРµРє, РєР°СЃС‚РѕРјРЅС‹С… РїРѕР»РµР№ Рё РїСЂР°РІ РґРѕСЃС‚СѓРїР°.
"""

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, RootModel

from app.schemas.datetime_utc import UtcDateTime

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
    created_at: UtcDateTime


# --- Permissions ---


class RolePermissionsResponse(RootModel[Dict[str, Dict[str, bool]]]):
    """Словарь {role: {permission: bool}} по всем группам (включая кастомные)."""

    root: Dict[str, Dict[str, bool]] = {}


class UpdateRolePermissionRequest(BaseModel):
    permissions: Dict[str, bool]


# --- User Groups (custom roles) ---


class UserGroupResponse(BaseModel):
    """Группа пользователей (роль) в реестре."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    label: str
    description: Optional[str] = None
    base_access: str
    is_system: bool
    sort_order: int = 0


class UserGroupCreate(BaseModel):
    """Создание кастомной группы."""

    name: str = Field(min_length=2, max_length=20, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    base_access: str = "worker"
    sort_order: int = 0


class UserGroupUpdate(BaseModel):
    """Обновление группы. ``name`` — новый slug (только для кастомных групп)."""

    name: Optional[str] = Field(
        default=None, min_length=2, max_length=20, pattern=r"^[a-z][a-z0-9_]*$"
    )
    label: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    base_access: Optional[str] = None
    sort_order: Optional[int] = None


# --- Backups ---


class BackupFile(BaseModel):
    name: str
    size: int
    created: UtcDateTime


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
