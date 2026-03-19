"""
Schemas Package
===============
Р­РєСЃРїРѕСЂС‚ РІСЃРµС… Pydantic СЃС…РµРј.
"""

from app.schemas.auth import (
    Token, TokenData, RefreshRequest,
    UserCreate, UserUpdate, UserResponse,
    PasswordChange, UserStatsResponse,
    ReportSettingsUpdate, ReportSettingsResponse
)
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskStatusUpdate,
    TaskAssignRequest, PlannedDateUpdate,
    TaskResponse, TaskListResponse, PaginatedResponse,
    ParseTaskRequest, ParsedTaskResponse,
    CreateTaskFromTextRequest, CreateTaskFromTextResponse,
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
from app.schemas.chat import (
    ConversationCreate, ConversationUpdate,
    ConversationResponse, ConversationDetailResponse, ConversationListItem,
    MemberInfo, LastMessagePreview,
    MessageCreate, MessageUpdate, MessageResponse, MessageListResponse,
    AttachmentResponse, ReactionInfo, MentionInfo, ReplyPreview,
    ReactionCreate, ReadReceiptRequest,
    MemberAddRequest, MemberRemoveRequest,
    MuteRequest, ArchiveRequest,
    MessageSearchRequest, TypingIndicator,
)

__all__ = [
    # Auth
    "Token", "TokenData", "RefreshRequest",
    "UserCreate", "UserUpdate", "UserResponse",
    "PasswordChange", "UserStatsResponse",
    "ReportSettingsUpdate", "ReportSettingsResponse",
    # Task
    "TaskCreate", "TaskUpdate", "TaskStatusUpdate",
    "TaskAssignRequest", "PlannedDateUpdate",
    "TaskResponse", "TaskListResponse", "PaginatedResponse",
    "ParseTaskRequest", "ParsedTaskResponse",
    "CreateTaskFromTextRequest", "CreateTaskFromTextResponse",
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
    # Chat
    "ConversationCreate", "ConversationUpdate",
    "ConversationResponse", "ConversationDetailResponse", "ConversationListItem",
    "MemberInfo", "LastMessagePreview",
    "MessageCreate", "MessageUpdate", "MessageResponse", "MessageListResponse",
    "AttachmentResponse", "ReactionInfo", "MentionInfo", "ReplyPreview",
    "ReactionCreate", "ReadReceiptRequest",
    "MemberAddRequest", "MemberRemoveRequest",
    "MuteRequest", "ArchiveRequest",
    "MessageSearchRequest", "TypingIndicator",
]
