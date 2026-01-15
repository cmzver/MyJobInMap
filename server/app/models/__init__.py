"""
Models Package
==============
Экспорт всех моделей.

Структура:
- base.py: Base, engine, SessionLocal, get_db, init_db
- enums.py: TaskStatus, TaskPriority, UserRole
- user.py: UserModel, DeviceModel
- task.py: TaskModel, CommentModel, TaskPhotoModel
- address.py: AddressModel + все связанные (systems, equipment, documents, contacts, history)
- notification.py: NotificationModel, NotificationType
- settings.py: SystemSettingModel, CustomFieldModel, RolePermissionModel + helper functions
"""

from app.models.base import Base, engine, SessionLocal, get_db, init_db
from app.models.enums import TaskStatus, TaskPriority, UserRole
from app.models.user import UserModel, DeviceModel
from app.models.task import TaskModel, CommentModel, TaskPhotoModel
from app.models.address import (
    # Enums
    SystemType,
    SystemStatus,
    EquipmentType,
    EquipmentStatus,
    DocumentType,
    ContactType,
    AddressHistoryEventType,
    # Models
    AddressModel,
    AddressSystemModel,
    AddressEquipmentModel,
    AddressDocumentModel,
    AddressContactModel,
    AddressHistoryModel,
)
from app.models.notification import NotificationModel, NotificationType
from app.models.settings import (
    SystemSettingModel,
    CustomFieldModel,
    CustomFieldValueModel,
    RolePermissionModel,
    get_setting,
    set_setting,
    get_settings_by_group,
    get_all_settings,
    init_default_settings,
)

__all__ = [
    # Base
    "Base",
    "engine", 
    "SessionLocal",
    "get_db",
    "init_db",
    # Task Enums
    "TaskStatus",
    "TaskPriority", 
    "UserRole",
    "NotificationType",
    # Address Enums
    "SystemType",
    "SystemStatus",
    "EquipmentType",
    "EquipmentStatus",
    "DocumentType",
    "ContactType",
    "AddressHistoryEventType",
    # User Models
    "UserModel",
    "DeviceModel",
    # Task Models
    "TaskModel",
    "CommentModel",
    "TaskPhotoModel",
    # Address Models
    "AddressModel",
    "AddressSystemModel",
    "AddressEquipmentModel",
    "AddressDocumentModel",
    "AddressContactModel",
    "AddressHistoryModel",
    # Notification
    "NotificationModel",
    # Settings Models
    "SystemSettingModel",
    "CustomFieldModel",
    "CustomFieldValueModel",
    "RolePermissionModel",
    # Settings Functions
    "get_setting",
    "set_setting",
    "get_settings_by_group",
    "get_all_settings",
    "init_default_settings",
]
