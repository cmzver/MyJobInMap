"""
Settings Service
================
Бизнес-логика системных настроек (раздел /api/admin/settings*), типов
неисправностей и настроек Telegram-бота. Роутер app/api/admin/settings.py —
тонкий: держит Pydantic-схемы (response_model/тело запроса) и делегирует сюда.

Сервис схемо-независим: принимает примитивы, возвращает dict/list — FastAPI
приводит к response_model на уровне роутера. Публичный login-branding-эндпоинт
остался в роутере (исторически испорченная кодировка дефолтов — не трогаем).
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import Depends
from sqlalchemy.orm import Session

from app.models import (
    SystemSettingModel,
    get_all_settings,
    get_db,
    get_setting,
    init_default_settings,
    set_setting,
)

logger = logging.getLogger(__name__)

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

TELEGRAM_SETTINGS_KEY = "telegram_group_worker_map"
TELEGRAM_KNOWN_GROUPS_KEY = "telegram_known_groups"


class SettingsServiceError(Exception):
    """Исключение операций с настройками."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


def _get_int_setting(db: Session, key: str, default: int, minimum: int) -> int:
    value = get_setting(db, key, default)
    try:
        return max(minimum, int(value))
    except (TypeError, ValueError):
        return default


def _normalize_task_priority(value: Any, default: str = "PLANNED") -> str:
    normalized = str(value or "").strip().upper()
    mapping = {
        "1": "PLANNED",
        "2": "CURRENT",
        "3": "URGENT",
        "4": "EMERGENCY",
        "PLANNED": "PLANNED",
        "CURRENT": "CURRENT",
        "URGENT": "URGENT",
        "EMERGENCY": "EMERGENCY",
    }
    return mapping.get(normalized, default)


def _setting_to_dict(setting: SystemSettingModel) -> dict:
    return {
        "key": setting.key,
        "value": setting.get_typed_value(),
        "value_type": setting.value_type,
        "group": setting.group,
        "label": setting.label,
        "description": setting.description,
        "options": setting.options,
        "is_readonly": setting.is_readonly,
        "updated_at": setting.updated_at,
    }


class SettingsService:
    """Системные настройки, типы неисправностей и Telegram-бот."""

    def __init__(self, db: Session):
        self.db = db

    # -- System settings ----------------------------------------------------

    def get_grouped_settings(self) -> List[dict]:
        """Все системные настройки, сгруппированные по group."""
        init_default_settings(self.db)
        settings = get_all_settings(self.db)

        groups_dict: Dict[str, dict] = {}
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
            groups_dict[setting.group]["settings"].append(_setting_to_dict(setting))

        return list(groups_dict.values())

    def get_interface_settings(self) -> dict:
        """Публичные настройки интерфейса."""
        init_default_settings(self.db)
        enable_resizable_columns = get_setting(self.db, "enable_resizable_columns")
        compact_table_view = get_setting(self.db, "compact_table_view")
        tasks_per_page = _get_int_setting(
            self.db, "tasks_per_page", default=20, minimum=1
        )
        auto_refresh_interval = _get_int_setting(
            self.db, "auto_refresh_interval", default=30, minimum=0
        )
        default_task_priority = _normalize_task_priority(
            get_setting(self.db, "default_task_priority", "PLANNED")
        )
        if enable_resizable_columns is None:
            enable_resizable_columns = True
        if compact_table_view is None:
            compact_table_view = False

        return {
            "enable_resizable_columns": bool(enable_resizable_columns),
            "compact_table_view": bool(compact_table_view),
            "tasks_per_page": tasks_per_page,
            "auto_refresh_interval": auto_refresh_interval,
            "default_task_priority": default_task_priority,
        }

    def get_single_setting(self, key: str) -> dict:
        init_default_settings(self.db)
        setting = (
            self.db.query(SystemSettingModel)
            .filter(SystemSettingModel.key == key)
            .first()
        )
        if not setting:
            raise SettingsServiceError("Настройка не найдена", 404)
        return _setting_to_dict(setting)

    def update_single_setting(self, key: str, value: Any, updated_by: str) -> dict:
        init_default_settings(self.db)
        setting = (
            self.db.query(SystemSettingModel)
            .filter(SystemSettingModel.key == key)
            .first()
        )
        if not setting:
            raise SettingsServiceError("Настройка не найдена", 404)
        if setting.is_readonly:
            raise SettingsServiceError("Настройка только для чтения", 400)

        setting.set_typed_value(value)
        setting.updated_by = updated_by
        self.db.commit()
        return {"status": "ok", "key": key, "value": setting.get_typed_value()}

    def update_settings_bulk(self, updates: Dict[str, Any], updated_by: str) -> dict:
        init_default_settings(self.db)
        updated: List[str] = []
        errors: List[str] = []

        for key, value in updates.items():
            setting = (
                self.db.query(SystemSettingModel)
                .filter(SystemSettingModel.key == key)
                .first()
            )
            if not setting:
                errors.append(f"Настройка '{key}' не найдена")
                continue
            if setting.is_readonly:
                errors.append(f"Настройка '{key}' только для чтения")
                continue

            setting.set_typed_value(value)
            setting.updated_by = updated_by
            updated.append(key)

        self.db.commit()
        return {"status": "ok", "updated": updated, "errors": errors}

    # -- Defect types -------------------------------------------------------

    def list_defect_types(self) -> List[dict]:
        init_default_settings(self.db)
        types_data = get_setting(self.db, "defect_types")
        if not types_data:
            return []
        if not isinstance(types_data, list):
            return []
        return types_data

    def add_defect_type(
        self,
        name: str,
        description: Optional[str],
        system_types: Optional[List[str]],
    ) -> dict:
        import uuid

        types_data = get_setting(self.db, "defect_types")
        if not types_data:
            types_data = []

        new_type = {
            "id": str(uuid.uuid4()),
            "name": name.strip(),
            "description": description,
            "system_types": system_types or [],
        }
        types_data.append(new_type)
        set_setting(self.db, "defect_types", json.dumps(types_data, ensure_ascii=False))
        return new_type

    def delete_defect_type(self, defect_type_id: str) -> None:
        types_data = get_setting(self.db, "defect_types")
        if not types_data:
            raise SettingsServiceError("Тип не найден", 404)

        original_len = len(types_data)
        types_data = [t for t in types_data if t.get("id") != defect_type_id]
        if len(types_data) == original_len:
            raise SettingsServiceError("Тип не найден", 404)

        set_setting(self.db, "defect_types", json.dumps(types_data, ensure_ascii=False))

    # -- Telegram bot -------------------------------------------------------

    def _get_bot_mappings(self) -> list:
        """Получить маппинги из БД (сырой список dict'ов)."""
        raw = get_setting(self.db, TELEGRAM_SETTINGS_KEY)
        if isinstance(raw, list):
            return raw
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, TypeError):
                return []
        return []

    def _save_bot_mappings(self, mappings: list, updated_by: str) -> None:
        setting = (
            self.db.query(SystemSettingModel)
            .filter(SystemSettingModel.key == TELEGRAM_SETTINGS_KEY)
            .first()
        )
        if setting:
            setting.value = json.dumps(mappings, ensure_ascii=False)
            setting.value_type = "json"
            setting.updated_by = updated_by
        else:
            setting = SystemSettingModel(
                key=TELEGRAM_SETTINGS_KEY,
                value=json.dumps(mappings, ensure_ascii=False),
                value_type="json",
                group="telegram",
                label="Маппинг групп → работников",
                description="Соответствие названий Telegram-групп и username исполнителей",
                is_hidden=True,
            )
            self.db.add(setting)
        self.db.commit()

    def _get_known_groups(self) -> list:
        raw = get_setting(self.db, TELEGRAM_KNOWN_GROUPS_KEY)
        if isinstance(raw, list):
            return raw
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, TypeError):
                return []
        return []

    def _save_known_groups(self, groups: list) -> None:
        setting = (
            self.db.query(SystemSettingModel)
            .filter(SystemSettingModel.key == TELEGRAM_KNOWN_GROUPS_KEY)
            .first()
        )
        value = json.dumps(groups, ensure_ascii=False)
        if setting:
            setting.value = value
            setting.value_type = "json"
        else:
            setting = SystemSettingModel(
                key=TELEGRAM_KNOWN_GROUPS_KEY,
                value=value,
                value_type="json",
                group="telegram",
                label="Известные Telegram-группы",
                description="Группы, в которых бот обнаружил активность",
                is_hidden=True,
            )
            self.db.add(setting)
        self.db.commit()

    def get_telegram_bot_settings(self) -> dict:
        """Полные настройки Telegram-бота (отфильтрованные)."""
        mappings = self._get_bot_mappings()
        enabled = bool(get_setting(self.db, "telegram_bot_enabled", True))
        dedup = bool(get_setting(self.db, "telegram_bot_dedup_enabled", True))
        known_groups = self._get_known_groups()
        return {
            "enabled": enabled,
            "group_worker_map": [
                m for m in mappings if "group_name" in m and "username" in m
            ],
            "dedup_enabled": dedup,
            "known_groups": [
                g for g in known_groups if "chat_id" in g and "title" in g
            ],
        }

    def update_telegram_bot_settings(
        self,
        enabled: bool,
        dedup_enabled: bool,
        mappings: List[dict],
        updated_by: str,
    ) -> dict:
        """Обновить настройки Telegram-бота целиком."""
        set_setting(
            self.db,
            "telegram_bot_enabled",
            enabled,
            updated_by=updated_by,
            description="Бот включён",
            group="telegram",
        )
        set_setting(
            self.db,
            "telegram_bot_dedup_enabled",
            dedup_enabled,
            updated_by=updated_by,
            description="Дедупликация заявок по номеру",
            group="telegram",
        )
        self._save_bot_mappings(mappings, updated_by=updated_by)
        logger.info("Настройки Telegram-бота обновлены (%d маппингов)", len(mappings))
        return {"status": "ok"}

    def get_bot_mappings_public(self) -> dict:
        """Маппинг групп → работников для бота: {group_name_lower: username}."""
        enabled = bool(get_setting(self.db, "telegram_bot_enabled", True))
        if not enabled:
            return {"enabled": False, "mappings": {}, "dedup_enabled": False}

        mappings = self._get_bot_mappings()
        dedup = bool(get_setting(self.db, "telegram_bot_dedup_enabled", True))
        result: Dict[str, str] = {}
        for m in mappings:
            gn = m.get("group_name", "").strip().lower()
            un = m.get("username", "").strip()
            if gn and un:
                result[gn] = un
        return {"enabled": True, "mappings": result, "dedup_enabled": dedup}

    def report_bot_group(self, chat_id: int, title: str) -> None:
        """Бот сообщает о группе: обновить last_seen или добавить."""
        groups = self._get_known_groups()
        now = datetime.utcnow().isoformat()
        found = False
        for g in groups:
            if g.get("chat_id") == chat_id:
                g["title"] = title
                g["last_seen"] = now
                found = True
                break
        if not found:
            groups.append({"chat_id": chat_id, "title": title, "last_seen": now})
        self._save_known_groups(groups)


def get_settings_service(db: Session = Depends(get_db)) -> SettingsService:
    return SettingsService(db)
