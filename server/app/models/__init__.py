"""
Models Package
==============
Р­РєСЃРїРѕСЂС‚ РІСЃРµС… РјРѕРґРµР»РµР№.

РЎС‚СЂСѓРєС‚СѓСЂР°:
- base.py: Base, engine, SessionLocal, get_db, init_db
- enums.py: TaskStatus, TaskPriority, UserRole
- user.py: UserModel, DeviceModel
- task.py: TaskModel, CommentModel, TaskPhotoModel
- address.py: AddressModel + РІСЃРµ СЃРІСЏР·Р°РЅРЅС‹Рµ (systems, equipment, documents, contacts, history)
- notification.py: NotificationModel, NotificationType
- settings.py: SystemSettingModel, CustomFieldModel, RolePermissionModel + helper functions
"""

from app.models.address import AddressContactModel  # Enums; Models
from app.models.address import (
    AddressAssigneeModel,
    AddressDocumentModel,
    AddressEquipmentModel,
    AddressHistoryEventType,
    AddressHistoryModel,
    AddressModel,
    AddressSystemModel,
    ContactType,
    DocumentType,
    EquipmentStatus,
    EquipmentType,
    IntercomActionModel,
    IntercomPanelModel,
    SystemStatus,
    SystemType,
)
from app.models.base import Base, SessionLocal, engine, get_db, init_db, run_migrations
from app.models.chat import (
    ConversationMemberModel,
    ConversationMemberRole,
    ConversationModel,
    ConversationType,
    MessageAttachmentModel,
    MessageMentionModel,
    MessageModel,
    MessageReactionModel,
    MessageType,
)
from app.models.enums import TaskPriority, TaskStatus, UserRole
from app.models.notification import NotificationModel, NotificationType
from app.models.organization import OrganizationModel
from app.models.security import (
    BlockedIPModel,
    IPAllowlistModel,
    IPSecurityEventModel,
)
from app.models.settings import (
    CustomFieldModel,
    RolePermissionModel,
    SystemSettingModel,
    UserGroupModel,
    get_all_settings,
    get_setting,
    get_settings_by_group,
    init_default_settings,
    set_setting,
)
from app.models.support import (
    SupportTicketCategory,
    SupportTicketCommentModel,
    SupportTicketCommentType,
    SupportTicketModel,
    SupportTicketStatus,
)
from app.models.task import CommentModel, TaskModel, TaskPhotoModel
from app.models.user import DeviceModel, PushSubscriptionModel, UserModel

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
    "SupportTicketCategory",
    "SupportTicketCommentModel",
    "SupportTicketCommentType",
    "SupportTicketModel",
    "SupportTicketStatus",
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
    "PushSubscriptionModel",
    # Organization
    "OrganizationModel",
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
    "AddressAssigneeModel",
    "AddressHistoryModel",
    "IntercomPanelModel",
    "IntercomActionModel",
    # Notification
    "NotificationModel",
    # Security
    "BlockedIPModel",
    "IPAllowlistModel",
    "IPSecurityEventModel",
    # Chat
    "ConversationType",
    "ConversationMemberRole",
    "MessageType",
    "ConversationModel",
    "ConversationMemberModel",
    "MessageModel",
    "MessageAttachmentModel",
    "MessageReactionModel",
    "MessageMentionModel",
    # Settings Models
    "SystemSettingModel",
    "CustomFieldModel",
    "RolePermissionModel",
    "UserGroupModel",
    # Settings Functions
    "get_setting",
    "set_setting",
    "get_settings_by_group",
    "get_all_settings",
    "init_default_settings",
]
