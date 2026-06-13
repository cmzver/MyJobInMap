"""
System Settings API
===================
Тонкие контроллеры системных настроек, типов неисправностей и Telegram-бота.
Логика — в SettingsService. Публичный login-branding остался здесь (исторически
испорченная кодировка дефолтов — не трогаем).
Custom Fields, Permissions и Backups — см. соседние модули admin-пакета.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.models import UserModel, get_db, get_setting, init_default_settings
from app.services import get_current_superadmin, require_permission
from app.services.settings_service import (
    SettingsService,
    SettingsServiceError,
    get_settings_service,
)

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
    tasks_per_page: int
    auto_refresh_interval: int
    default_task_priority: str


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
    admin: UserModel = Depends(get_current_superadmin),
    service: SettingsService = Depends(get_settings_service),
):
    """Получить все системные настройки, сгруппированные"""
    return service.get_grouped_settings()


@router.get("/settings/interface", response_model=InterfaceSettingsResponse)
async def get_interface_settings(
    service: SettingsService = Depends(get_settings_service),
):
    """Получить публичные настройки интерфейса"""
    return service.get_interface_settings()


@public_router.get("/login-branding", response_model=LoginBrandingResponse)
async def get_login_branding_settings(db: Session = Depends(get_db)):
    """�������� ��������� ��������� ��������� � ����� ��������� ��� �������� �����."""
    return _build_login_branding_response(db)


# ============================================
# Defect Types API
# ============================================


@router.get("/settings/defect-types", response_model=List[DefectTypeResponse])
async def get_defect_types(
    service: SettingsService = Depends(get_settings_service),
):
    """Получить список типов неисправностей (доступно всем)"""
    try:
        return [DefectTypeResponse(**t) for t in service.list_defect_types()]
    except (ValueError, TypeError):
        return []


@router.post("/settings/defect-types", response_model=DefectTypeResponse)
async def add_defect_type(
    data: DefectTypeCreate,
    admin: UserModel = Depends(get_current_superadmin),
    service: SettingsService = Depends(get_settings_service),
):
    """Добавить новый тип неисправности (только админы)"""
    new_type = service.add_defect_type(data.name, data.description, data.system_types)
    return DefectTypeResponse(**new_type)


@router.delete("/settings/defect-types/{defect_type_id}")
async def delete_defect_type(
    defect_type_id: str,
    admin: UserModel = Depends(get_current_superadmin),
    service: SettingsService = Depends(get_settings_service),
):
    """Удалить тип неисправности (только админы)"""
    try:
        service.delete_defect_type(defect_type_id)
    except SettingsServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"status": "deleted"}


@router.get("/settings/{key}")
async def get_single_setting(
    key: str,
    admin: UserModel = Depends(get_current_superadmin),
    service: SettingsService = Depends(get_settings_service),
):
    """Получить одну настройку"""
    try:
        return service.get_single_setting(key)
    except SettingsServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.patch("/settings/{key}")
async def update_setting(
    key: str,
    data: LocalSettingUpdate,
    admin: UserModel = Depends(get_current_superadmin),
    service: SettingsService = Depends(get_settings_service),
):
    """Обновить настройку"""
    try:
        return service.update_single_setting(key, data.value, admin.username)
    except SettingsServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.patch("/settings")
async def update_settings_bulk(
    updates: Dict[str, Any],
    admin: UserModel = Depends(get_current_superadmin),
    service: SettingsService = Depends(get_settings_service),
):
    """Массовое обновление настроек"""
    return service.update_settings_bulk(updates, admin.username)


# ============================================
# Telegram Bot Settings
# ============================================


class TelegramGroupMapping(BaseModel):
    """Маппинг Telegram-группы на работника"""

    group_name: str
    username: str

    @field_validator("group_name")
    @classmethod
    def group_name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Название группы не может быть пустым")
        return v

    @field_validator("username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Username не может быть пустым")
        return v


class TelegramKnownGroup(BaseModel):
    """Группа, в которой бот был замечен"""

    chat_id: int
    title: str
    last_seen: Optional[str] = None


class TelegramBotSettingsResponse(BaseModel):
    """Полные настройки Telegram-бота"""

    enabled: bool
    group_worker_map: List[TelegramGroupMapping]
    dedup_enabled: bool
    known_groups: List[TelegramKnownGroup] = []


@router.get("/telegram-bot", response_model=TelegramBotSettingsResponse)
async def get_telegram_bot_settings(
    admin: UserModel = Depends(get_current_superadmin),
    service: SettingsService = Depends(get_settings_service),
):
    """Получить настройки Telegram-бота."""
    return service.get_telegram_bot_settings()


@router.patch("/telegram-bot")
async def update_telegram_bot_settings(
    data: TelegramBotSettingsResponse,
    admin: UserModel = Depends(get_current_superadmin),
    service: SettingsService = Depends(get_settings_service),
):
    """Обновить настройки Telegram-бота целиком."""
    mappings = [
        {"group_name": m.group_name.strip(), "username": m.username.strip()}
        for m in data.group_worker_map
    ]
    return service.update_telegram_bot_settings(
        data.enabled, data.dedup_enabled, mappings, admin.username
    )


@public_router.get("/telegram-bot/mappings")
async def get_bot_mappings_public(
    user: UserModel = Depends(require_permission("create_tasks")),
    service: SettingsService = Depends(get_settings_service),
):
    """
    Получить маппинг групп → работников (для бота).

    Доступно авторизованным пользователям с правом создания заявок.
    Возвращает словарь {group_name_lower: username}.
    """
    return service.get_bot_mappings_public()


class _ReportGroupBody(BaseModel):
    chat_id: int
    title: str


@public_router.post("/telegram-bot/report-group")
async def report_bot_group(
    body: _ReportGroupBody,
    user: UserModel = Depends(require_permission("create_tasks")),
    service: SettingsService = Depends(get_settings_service),
):
    """
    Бот сообщает о группе, в которой он находится.
    Обновляет last_seen если группа уже известна, иначе добавляет.
    """
    service.report_bot_group(body.chat_id, body.title)
    return {"status": "ok"}
