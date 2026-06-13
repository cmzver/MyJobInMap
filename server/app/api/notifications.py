"""Notifications API — тонкие контроллеры поверх NotificationService."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models import UserModel
from app.schemas import NotificationResponse, PushNotificationRequest
from app.services import (
    NotificationService,
    NotificationServiceError,
    get_current_admin,
    get_current_user_required,
    get_notification_service,
)

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    is_read: Optional[bool] = Query(None, description="Filter by read status"),
    current_user: UserModel = Depends(get_current_user_required),
    service: NotificationService = Depends(get_notification_service),
):
    """Get notifications for the current user."""
    return service.list_for_user(current_user, is_read)


@router.patch("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    service: NotificationService = Depends(get_notification_service),
):
    """Mark a notification as read."""
    try:
        return service.mark_read(current_user, notification_id)
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.patch("/read-all")
async def mark_all_notifications_as_read(
    current_user: UserModel = Depends(get_current_user_required),
    service: NotificationService = Depends(get_notification_service),
):
    """Mark all notifications as read."""
    return service.mark_all_read(current_user)


@router.patch("/support-ticket/{ticket_id}/read")
async def mark_support_ticket_notifications_as_read(
    ticket_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    service: NotificationService = Depends(get_notification_service),
):
    """Mark unread support notifications for a ticket as read."""
    try:
        return service.mark_support_ticket_read(current_user, ticket_id)
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.patch("/task/{task_id}/read")
async def mark_task_notifications_as_read(
    task_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    service: NotificationService = Depends(get_notification_service),
):
    """Mark unread notifications for a task as read."""
    try:
        return service.mark_task_read(current_user, task_id)
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    service: NotificationService = Depends(get_notification_service),
):
    """Delete a notification."""
    try:
        return service.delete(current_user, notification_id)
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/send")
async def send_notification(
    request: PushNotificationRequest,
    admin: UserModel = Depends(get_current_admin),
    service: NotificationService = Depends(get_notification_service),
):
    """Send a push notification via FCM and WebSocket."""
    try:
        return service.send(admin, request)
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/test")
async def send_test_notification(
    admin: UserModel = Depends(get_current_admin),
    service: NotificationService = Depends(get_notification_service),
):
    """Send a test push notification via FCM and WebSocket."""
    return service.send_test(admin)
