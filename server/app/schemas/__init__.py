"""
Schemas Package
===============
Р­РєСЃРїРѕСЂС‚ РІСЃРµС… Pydantic СЃС…РµРј.
"""

from app.schemas.auth import (PasswordChange, RefreshRequest,
                              ReportSettingsResponse, ReportSettingsUpdate,
                              Token, TokenData, UserCreate, UserResponse,
                              UserStatsResponse, UserUpdate)
from app.schemas.chat import (ArchiveRequest, AttachmentResponse,
                              ConversationCreate, ConversationDetailResponse,
                              ConversationListItem, ConversationResponse,
                              ConversationUpdate, LastMessagePreview,
                              MemberAddRequest, MemberInfo,
                              MemberRemoveRequest, MentionInfo, MessageCreate,
                              MessageListResponse, MessageResponse,
                              MessageSearchRequest, MessageUpdate, MuteRequest,
                              ReactionCreate, ReactionInfo, ReadReceiptRequest,
                              ReplyPreview, TypingIndicator)
from app.schemas.comment import CommentCreate, CommentResponse
from app.schemas.device import DeviceRegister, DeviceResponse
from app.schemas.notification import (NotificationCreate, NotificationResponse,
                                      PushNotificationRequest)
from app.schemas.photo import PhotoResponse
from app.schemas.settings import (BackupFile, BackupListResponse,
                                  BackupSettingsResponse, BackupSettingsSchema,
                                  CustomFieldCreate, CustomFieldResponse,
                                  CustomFieldUpdate, RolePermissionsResponse,
                                  SettingsGroupSchema, SettingUpdate,
                                  SystemSettingSchema,
                                  UpdateRolePermissionRequest)
from app.schemas.support import (SupportTicketCommentCreate,
                                 SupportTicketCommentResponse,
                                 SupportTicketCreate,
                                 SupportTicketDetailResponse,
                                 SupportTicketReporter, SupportTicketResponse,
                                 SupportTicketUpdate)
from app.schemas.task import (CreateTaskFromTextRequest,
                              CreateTaskFromTextResponse, PaginatedResponse,
                              ParsedTaskResponse, ParseTaskRequest,
                              PlannedDateUpdate, TaskAssignRequest, TaskCreate,
                              TaskListResponse, TaskResponse, TaskStatusUpdate,
                              TaskUpdate)

__all__ = [
    # Auth
    "Token",
    "TokenData",
    "RefreshRequest",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "PasswordChange",
    "UserStatsResponse",
    "ReportSettingsUpdate",
    "ReportSettingsResponse",
    # Task
    "TaskCreate",
    "TaskUpdate",
    "TaskStatusUpdate",
    "TaskAssignRequest",
    "PlannedDateUpdate",
    "TaskResponse",
    "TaskListResponse",
    "PaginatedResponse",
    "ParseTaskRequest",
    "ParsedTaskResponse",
    "CreateTaskFromTextRequest",
    "CreateTaskFromTextResponse",
    # Comment
    "CommentCreate",
    "CommentResponse",
    # Photo
    "PhotoResponse",
    # Device
    "DeviceRegister",
    "DeviceResponse",
    # Notification
    "PushNotificationRequest",
    "NotificationCreate",
    "NotificationResponse",
    # Support
    "SupportTicketCommentCreate",
    "SupportTicketCommentResponse",
    "SupportTicketCreate",
    "SupportTicketDetailResponse",
    "SupportTicketReporter",
    "SupportTicketResponse",
    "SupportTicketUpdate",
    # Settings
    "SystemSettingSchema",
    "SettingsGroupSchema",
    "SettingUpdate",
    "CustomFieldCreate",
    "CustomFieldUpdate",
    "CustomFieldResponse",
    "RolePermissionsResponse",
    "UpdateRolePermissionRequest",
    "BackupListResponse",
    "BackupFile",
    "BackupSettingsSchema",
    "BackupSettingsResponse",
    # Chat
    "ConversationCreate",
    "ConversationUpdate",
    "ConversationResponse",
    "ConversationDetailResponse",
    "ConversationListItem",
    "MemberInfo",
    "LastMessagePreview",
    "MessageCreate",
    "MessageUpdate",
    "MessageResponse",
    "MessageListResponse",
    "AttachmentResponse",
    "ReactionInfo",
    "MentionInfo",
    "ReplyPreview",
    "ReactionCreate",
    "ReadReceiptRequest",
    "MemberAddRequest",
    "MemberRemoveRequest",
    "MuteRequest",
    "ArchiveRequest",
    "MessageSearchRequest",
    "TypingIndicator",
]
