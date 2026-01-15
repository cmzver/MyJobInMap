"""
Services Package
================
Экспорт сервисов.
"""

from app.services.geocoding import geocoding_service, GeocodingService
from app.services.push import (
    init_firebase,
    send_push_notification,
    send_push_background,
    _send_push_sync
)

from app.services.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    authenticate_user,
    get_current_user,
    get_current_user_required,
    get_current_admin,
    get_current_dispatcher_or_admin,
    check_permission,
    require_permission,
    enforce_worker_task_access,
    create_default_users,
    oauth2_scheme
)
from app.services.image_optimizer import image_optimizer, ImageOptimizationService
from app.services.task_service import (
    TaskService,
    TaskServiceError,
    TaskNotFoundError,
    PermissionDeniedError,
    InvalidTransitionError,
    get_task_service
)
from app.services.task_state_machine import TaskStatusMachine
from app.services.task_parser import parse_dispatcher_message, parse_task_message
from app.services.notification_service import (
    create_notification,
    create_task_status_notification,
    create_task_assignment_notification
)

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
    "authenticate_user",
    "get_current_user",
    "get_current_user_required",
    "get_current_admin",
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
]
