"""
Schemas Package
===============
Экспорт всех Pydantic схем.
"""

from app.schemas.auth import (
    Token, TokenData,
    UserCreate, UserUpdate, UserResponse,
    PasswordChange, UserStatsResponse,
    ReportSettingsUpdate, ReportSettingsResponse
)
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskStatusUpdate,
    TaskAssignRequest, PlannedDateUpdate,
    TaskResponse, TaskListResponse, PaginatedResponse
)
from app.schemas.comment import CommentCreate, CommentResponse
from app.schemas.photo import PhotoResponse
from app.schemas.device import DeviceRegister, DeviceResponse
from app.schemas.notification import (
    PushNotificationRequest,
    NotificationCreate, NotificationResponse
)
from app.schemas.settings import (
    SystemSettingSchema, SettingsGroupSchema, SettingUpdate,
    CustomFieldCreate, CustomFieldUpdate, CustomFieldResponse,
    RolePermissionsResponse, UpdateRolePermissionRequest,
    BackupListResponse, BackupFile,
    BackupSettingsSchema, BackupSettingsResponse
)

__all__ = [
    # Auth
    "Token", "TokenData",
    "UserCreate", "UserUpdate", "UserResponse",
    "PasswordChange", "UserStatsResponse",
    "ReportSettingsUpdate", "ReportSettingsResponse",
    # Task
    "TaskCreate", "TaskUpdate", "TaskStatusUpdate",
    "TaskAssignRequest", "PlannedDateUpdate",
    "TaskResponse", "TaskListResponse", "PaginatedResponse",
    # Comment
    "CommentCreate", "CommentResponse",
    # Photo
    "PhotoResponse",
    # Device
    "DeviceRegister", "DeviceResponse",
    # Notification
    "PushNotificationRequest",
    "NotificationCreate", "NotificationResponse",
    # Settings
    "SystemSettingSchema", "SettingsGroupSchema", "SettingUpdate",
    "CustomFieldCreate", "CustomFieldUpdate", "CustomFieldResponse",
    "RolePermissionsResponse", "UpdateRolePermissionRequest",
    "BackupListResponse", "BackupFile",
    "BackupSettingsSchema", "BackupSettingsResponse",
]
