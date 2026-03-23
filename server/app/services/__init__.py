"""
Services Package
================
Р­РєСЃРїРѕСЂС‚ СЃРµСЂРІРёСЃРѕРІ.
"""

from app.services import chat_service
from app.services.audit_log import audit_log
from app.services.auth import (authenticate_user, check_permission,
                               create_access_token, create_default_users,
                               create_refresh_token,
                               enforce_worker_task_access, get_current_admin,
                               get_current_dispatcher_or_admin,
                               get_current_superadmin, get_current_user,
                               get_current_user_required, get_password_hash,
                               oauth2_scheme, require_permission,
                               verify_password, verify_refresh_token)
from app.services.geocoding import GeocodingService, geocoding_service
from app.services.image_optimizer import (ImageOptimizationService,
                                          image_optimizer)
from app.services.notification_service import (
    create_notification, create_task_assignment_notification,
    create_task_status_notification)
from app.services.push import (_send_push_sync, init_firebase,
                               send_push_background, send_push_notification)
from app.services.task_parser import (parse_dispatcher_message,
                                      parse_task_message)
from app.services.task_service import (InvalidTransitionError,
                                       PermissionDeniedError,
                                       TaskNotFoundError, TaskService,
                                       TaskServiceError, get_task_service)
from app.services.task_state_machine import TaskStatusMachine

__all__ = [
    # Geocoding
    "geocoding_service",
    "GeocodingService",
    # Push
    "init_firebase",
    "send_push_notification",
    "send_push_background",
    "_send_push_sync",
    # Auth
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "create_refresh_token",
    "verify_refresh_token",
    "authenticate_user",
    "get_current_user",
    "get_current_user_required",
    "get_current_admin",
    "get_current_superadmin",
    "get_current_dispatcher_or_admin",
    "check_permission",
    "require_permission",
    "enforce_worker_task_access",
    "create_default_users",
    "oauth2_scheme",
    # Image optimization
    "image_optimizer",
    "ImageOptimizationService",
    # Task Service
    "TaskService",
    "TaskServiceError",
    "TaskNotFoundError",
    "PermissionDeniedError",
    "InvalidTransitionError",
    "get_task_service",
    # Task helpers
    "TaskStatusMachine",
    "parse_dispatcher_message",
    "parse_task_message",
    # Notifications
    "create_notification",
    "create_task_status_notification",
    "create_task_assignment_notification",
    # Chat
    "chat_service",
    # Audit
    "audit_log",
]
