"""Notifications API."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.models import NotificationModel, SupportTicketModel, TaskModel, UserModel, get_db
from app.schemas import NotificationResponse, PushNotificationRequest
from app.services import _send_push_sync, enforce_worker_task_access, get_current_admin, get_current_user_required
from app.services.role_utils import is_superadmin_user
from app.services.tenant_filter import TenantFilter


router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def _get_accessible_support_tickets(db: Session, current_user: UserModel) -> list[SupportTicketModel]:
    query = db.query(SupportTicketModel)
    if not is_superadmin_user(current_user):
        query = query.filter(SupportTicketModel.created_by_id == current_user.id)
    return query.all()


def _infer_support_ticket_id(notification: NotificationModel, tickets: list[SupportTicketModel]) -> Optional[int]:
    if notification.type != "support":
        return notification.support_ticket_id
    if notification.support_ticket_id is not None:
        return notification.support_ticket_id

    haystack = f"{notification.title}\n{notification.message}".lower()
    ordered_tickets = sorted(tickets, key=lambda ticket: len(ticket.title), reverse=True)

    for ticket in ordered_tickets:
        title = ticket.title.strip().lower()
        if title and title in haystack:
            return ticket.id

    return None


def _get_accessible_task_or_404(db: Session, current_user: UserModel, task_id: int) -> TaskModel:
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    tenant = TenantFilter(current_user)
    tenant.enforce_access(task, detail="Доступ к заявке запрещен")
    enforce_worker_task_access(current_user, task, detail="Доступ к заявке запрещен")

    return task


def _serialize_notification(
    notification: NotificationModel,
    tickets: list[SupportTicketModel],
) -> NotificationResponse:
    return NotificationResponse(
        id=notification.id,
        title=notification.title,
        message=notification.message,
        type=notification.type,
        is_read=notification.is_read,
        created_at=notification.created_at,
        task_id=notification.task_id,
        support_ticket_id=_infer_support_ticket_id(notification, tickets),
    )


@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    is_read: Optional[bool] = Query(None, description="Filter by read status"),
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Get notifications for the current user."""
    query = db.query(NotificationModel).filter(NotificationModel.user_id == current_user.id)

    if is_read is not None:
        query = query.filter(NotificationModel.is_read == is_read)

    notifications = query.order_by(NotificationModel.created_at.desc()).limit(100).all()
    support_tickets = _get_accessible_support_tickets(db, current_user)
    return [_serialize_notification(notification, support_tickets) for notification in notifications]


@router.patch("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Mark a notification as read."""
    notification = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id,
        NotificationModel.user_id == current_user.id,
    ).first()

    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")

    notification.is_read = True
    db.commit()

    return {"success": True, "message": "Уведомление отмечено как прочитанное"}


@router.patch("/read-all")
async def mark_all_notifications_as_read(
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Mark all notifications as read."""
    db.query(NotificationModel).filter(
        NotificationModel.user_id == current_user.id,
        NotificationModel.is_read == False,  # noqa: E712
    ).update({"is_read": True})

    db.commit()

    return {"success": True, "message": "Все уведомления отмечены как прочитанные"}


@router.patch("/support-ticket/{ticket_id}/read")
async def mark_support_ticket_notifications_as_read(
    ticket_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Mark unread support notifications for a ticket as read."""
    support_tickets = _get_accessible_support_tickets(db, current_user)
    accessible_ticket_ids = {ticket.id for ticket in support_tickets}

    if ticket_id not in accessible_ticket_ids:
        raise HTTPException(status_code=404, detail="Тикет поддержки не найден")

    notifications = db.query(NotificationModel).filter(
        NotificationModel.user_id == current_user.id,
        NotificationModel.type == "support",
        NotificationModel.is_read == False,  # noqa: E712
    ).all()

    updated = 0
    for notification in notifications:
        inferred_ticket_id = _infer_support_ticket_id(notification, support_tickets)
        if inferred_ticket_id == ticket_id:
            notification.is_read = True
            updated += 1

    db.commit()

    return {"success": True, "updated": updated}


@router.patch("/task/{task_id}/read")
async def mark_task_notifications_as_read(
    task_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Mark unread notifications for a task as read."""
    _get_accessible_task_or_404(db, current_user, task_id)

    updated = (
        db.query(NotificationModel)
        .filter(
            NotificationModel.user_id == current_user.id,
            NotificationModel.task_id == task_id,
            NotificationModel.is_read == False,  # noqa: E712
        )
        .update({"is_read": True})
    )

    db.commit()

    return {"success": True, "updated": updated}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Delete a notification."""
    notification = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id,
        NotificationModel.user_id == current_user.id,
    ).first()

    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")

    db.delete(notification)
    db.commit()

    return {"success": True, "message": "Уведомление удалено"}


@router.post("/send")
async def send_notification(
    request: PushNotificationRequest,
    admin: UserModel = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Send a push notification."""
    tenant = TenantFilter(admin)
    if request.user_ids and not tenant.is_superadmin:
        users = db.query(UserModel).filter(UserModel.id.in_(request.user_ids)).all()
        if len(users) != len(request.user_ids):
            raise HTTPException(status_code=404, detail="Некоторые пользователи не найдены")
        for target_user in users:
            tenant.enforce_access(
                target_user,
                detail="Нельзя отправить уведомление пользователю из другой организации",
            )

    result = _send_push_sync(
        title=request.title,
        body=request.body,
        notification_type=request.notification_type,
        task_id=request.task_id,
        user_ids=request.user_ids,
        organization_id=admin.organization_id,
    )

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result


@router.post("/test")
async def send_test_notification(
    admin: UserModel = Depends(get_current_admin),
):
    """Send a test push notification."""
    return _send_push_sync(
        title="🔔 Тестовое уведомление",
        body="Push-уведомления работают!",
        notification_type="general",
        organization_id=admin.organization_id,
    )
