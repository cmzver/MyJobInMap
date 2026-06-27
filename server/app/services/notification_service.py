"""
Notification Service
====================
Сервис для работы с уведомлениями.
"""

import asyncio
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import Depends
from sqlalchemy.orm import Session

from app.models import (
    NotificationModel,
    SupportTicketModel,
    TaskModel,
    UserModel,
    get_db,
)
from app.schemas import NotificationResponse, PushNotificationRequest
from app.services.auth import enforce_worker_task_access
from app.services.push import _send_push_sync, send_push_notification
from app.services.role_utils import is_superadmin_user
from app.services.tenant_filter import TenantFilter
from app.services.websocket_manager import _event, ws_manager
from app.utils import get_priority_display_name, get_priority_rank


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str = "system",
    task_id: Optional[int] = None,
    support_ticket_id: Optional[int] = None,
    conversation_id: Optional[int] = None,
) -> NotificationModel:
    """
    Создать уведомление для пользователя

    Args:
        db: Database session
        user_id: ID пользователя
        title: Заголовок уведомления
        message: Текст уведомления
        notification_type: Тип (task, system, alert)
        task_id: ID связанной заявки (опционально)

    Returns:
        NotificationModel: Созданное уведомление
    """
    notification = NotificationModel(
        user_id=user_id,
        title=title,
        message=message,
        type=notification_type,
        task_id=task_id,
        support_ticket_id=support_ticket_id,
        conversation_id=conversation_id,
        is_read=False,
        created_at=datetime.now(timezone.utc),
    )

    db.add(notification)
    db.commit()
    db.refresh(notification)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None and not loop.is_closed():
        loop.create_task(
            ws_manager.send_to_user(
                user_id,
                _event(
                    "notification_created",
                    {
                        "notification_id": notification.id,
                        "type": notification.type,
                        "title": notification.title,
                        "message": notification.message,
                        "task_id": notification.task_id,
                        "support_ticket_id": notification.support_ticket_id,
                        "conversation_id": notification.conversation_id,
                    },
                ),
            )
        )

    return notification


def create_task_status_notification(
    db: Session,
    task: TaskModel,
    old_status: str,
    new_status: str,
    changed_by: UserModel,
) -> None:
    """
    Создать уведомление при изменении статуса заявки

    Уведомляет:
    - Назначенного исполнителя (если есть)
    - Автора изменения (если он не исполнитель)
    """
    # Определяем тип и текст уведомления
    notification_type = "task"

    if new_status == "DONE":
        title = "✅ Заявка выполнена"
        message = f"Заявка №{task.task_number or task.id} - {task.title} выполнена"
    elif new_status == "IN_PROGRESS":
        title = "🔄 Заявка в работе"
        message = f"Заявка №{task.task_number or task.id} - {task.title} взята в работу"
    elif new_status == "CANCELLED":
        title = "❌ Заявка отменена"
        message = f"Заявка №{task.task_number or task.id} - {task.title} отменена"
    elif new_status == "NEW":
        title = "📋 Новая заявка"
        message = f"Заявка №{task.task_number or task.id} - {task.title}"
    else:
        title = "🔔 Статус заявки изменён"
        message = f"Заявка №{task.task_number or task.id}: {old_status} → {new_status}"

    # Добавляем информацию об исполнителе
    if changed_by:
        message += f"\nИзменил: {changed_by.full_name or changed_by.username}"

    # Создаём уведомление для назначенного исполнителя
    if task.assigned_user_id and task.assigned_user_id != changed_by.id:
        create_notification(
            db=db,
            user_id=task.assigned_user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            task_id=task.id,
        )

    # Если статус изменён на NEW, IN_PROGRESS или DONE, уведомляем админов/диспетчеров
    if new_status in ["NEW", "IN_PROGRESS", "DONE"] and changed_by.role not in [
        "admin",
        "dispatcher",
    ]:
        # Получаем всех админов/диспетчеров
        admins = (
            db.query(UserModel)
            .filter(
                UserModel.role.in_(["admin", "dispatcher"]),
                UserModel.is_active == True,  # noqa: E712
                UserModel.id != changed_by.id,
                UserModel.organization_id == task.organization_id,
            )
            .all()
        )

        for admin in admins:
            create_notification(
                db=db,
                user_id=admin.id,
                title=title,
                message=message,
                notification_type=notification_type,
                task_id=task.id,
            )


def create_task_assignment_notification(
    db: Session, task: TaskModel, assigned_to: UserModel, assigned_by: UserModel
) -> None:
    """
    Создать уведомление при назначении заявки
    """
    if assigned_to.id == assigned_by.id:
        return  # Не уведомляем, если пользователь назначил сам себе

    title = "📋 Вам назначена заявка"
    message = f"Заявка №{task.task_number or task.id} - {task.title}\n"
    message += f"Адрес: {task.raw_address}\n"
    message += f"Назначил: {assigned_by.full_name or assigned_by.username}"

    # Определяем приоритет
    notification_type = "task"
    if get_priority_rank(task.priority) >= 4:  # EMERGENCY
        notification_type = "alert"
        title = "⚠️ СРОЧНАЯ заявка!"

    create_notification(
        db=db,
        user_id=assigned_to.id,
        title=title,
        message=message,
        notification_type=notification_type,
        task_id=task.id,
    )

    # FCM push уведомление
    priority_name = get_priority_display_name(task.priority)
    push_title = (
        f"Новая заявка ({priority_name})"
        if get_priority_rank(task.priority) >= 3
        else "Вам назначена заявка"
    )
    send_push_notification(
        title=push_title,
        body=f"№{task.task_number}: {task.title[:50]}...",
        notification_type="task_assigned",
        task_id=task.id,
        user_ids=[assigned_to.id],
    )


def create_comment_notification(
    db: Session,
    task: TaskModel,
    comment_text: str,
    author: UserModel,
) -> None:
    """
    Создать уведомление при новом комментарии к заявке.

    Уведомляет:
    - Назначенного исполнителя (если не автор)
    - Админов/диспетчеров организации (кроме автора)
    """
    title = "💬 Новый комментарий"
    message = f"Заявка №{task.task_number or task.id} - {task.title}\n"
    message += f"{author.full_name or author.username}: {comment_text[:100]}"

    notify_user_ids: set[int] = set()

    # Назначенный исполнитель
    if task.assigned_user_id and task.assigned_user_id != author.id:
        notify_user_ids.add(task.assigned_user_id)

    # Админы/диспетчеры организации (кроме автора)
    admins = (
        db.query(UserModel)
        .filter(
            UserModel.role.in_(["admin", "dispatcher", "superadmin"]),
            UserModel.is_active == True,  # noqa: E712
            UserModel.id != author.id,
            UserModel.organization_id == task.organization_id,
        )
        .all()
    )
    for admin in admins:
        notify_user_ids.add(admin.id)

    for user_id in notify_user_ids:
        create_notification(
            db=db,
            user_id=user_id,
            title=title,
            message=message,
            notification_type="task",
            task_id=task.id,
        )


class NotificationServiceError(Exception):
    """Исключение операций с уведомлениями (API-слой)."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


def _infer_support_ticket_id(
    notification: NotificationModel, tickets: List[SupportTicketModel]
) -> Optional[int]:
    """Определить тикет поддержки для уведомления по прямой ссылке или заголовку."""
    if notification.type != "support":
        return notification.support_ticket_id
    if notification.support_ticket_id is not None:
        return notification.support_ticket_id

    haystack = f"{notification.title}\n{notification.message}".lower()
    ordered_tickets = sorted(
        tickets, key=lambda ticket: len(ticket.title), reverse=True
    )

    for ticket in ordered_tickets:
        title = ticket.title.strip().lower()
        if title and title in haystack:
            return ticket.id

    return None


class NotificationService:
    """Чтение/управление пользовательскими уведомлениями и рассылка push."""

    def __init__(self, db: Session):
        self.db = db

    # ---- helpers -----------------------------------------------------------

    def _accessible_support_tickets(
        self, current_user: UserModel
    ) -> List[SupportTicketModel]:
        query = self.db.query(SupportTicketModel)
        if not is_superadmin_user(current_user):
            query = query.filter(SupportTicketModel.created_by_id == current_user.id)
        return query.all()

    def _accessible_task_or_404(
        self, current_user: UserModel, task_id: int
    ) -> TaskModel:
        task = self.db.query(TaskModel).filter(TaskModel.id == task_id).first()
        if task is None:
            raise NotificationServiceError("Заявка не найдена", 404)

        tenant = TenantFilter(current_user)
        tenant.enforce_access(task, detail="Доступ к заявке запрещен")
        enforce_worker_task_access(
            current_user, task, detail="Доступ к заявке запрещен"
        )
        return task

    def _serialize(
        self,
        notification: NotificationModel,
        tickets: List[SupportTicketModel],
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

    # ---- public API --------------------------------------------------------

    def list_for_user(
        self, current_user: UserModel, is_read: Optional[bool]
    ) -> List[NotificationResponse]:
        query = self.db.query(NotificationModel).filter(
            NotificationModel.user_id == current_user.id
        )
        if is_read is not None:
            query = query.filter(NotificationModel.is_read == is_read)

        notifications = (
            query.order_by(NotificationModel.created_at.desc()).limit(100).all()
        )
        support_tickets = self._accessible_support_tickets(current_user)
        return [
            self._serialize(notification, support_tickets)
            for notification in notifications
        ]

    def mark_read(self, current_user: UserModel, notification_id: int) -> dict:
        notification = (
            self.db.query(NotificationModel)
            .filter(
                NotificationModel.id == notification_id,
                NotificationModel.user_id == current_user.id,
            )
            .first()
        )
        if not notification:
            raise NotificationServiceError("Уведомление не найдено", 404)

        notification.is_read = True
        self.db.commit()
        return {"success": True, "message": "Уведомление отмечено как прочитанное"}

    def mark_all_read(self, current_user: UserModel) -> dict:
        self.db.query(NotificationModel).filter(
            NotificationModel.user_id == current_user.id,
            NotificationModel.is_read == False,  # noqa: E712
        ).update({"is_read": True})
        self.db.commit()
        return {
            "success": True,
            "message": "Все уведомления отмечены как прочитанные",
        }

    def mark_support_ticket_read(self, current_user: UserModel, ticket_id: int) -> dict:
        support_tickets = self._accessible_support_tickets(current_user)
        accessible_ticket_ids = {ticket.id for ticket in support_tickets}
        if ticket_id not in accessible_ticket_ids:
            raise NotificationServiceError("Тикет поддержки не найден", 404)

        notifications = (
            self.db.query(NotificationModel)
            .filter(
                NotificationModel.user_id == current_user.id,
                NotificationModel.type == "support",
                NotificationModel.is_read == False,  # noqa: E712
            )
            .all()
        )

        updated = 0
        for notification in notifications:
            inferred_ticket_id = _infer_support_ticket_id(notification, support_tickets)
            if inferred_ticket_id == ticket_id:
                notification.is_read = True
                updated += 1

        self.db.commit()
        return {"success": True, "updated": updated}

    def mark_task_read(self, current_user: UserModel, task_id: int) -> dict:
        self._accessible_task_or_404(current_user, task_id)
        updated = (
            self.db.query(NotificationModel)
            .filter(
                NotificationModel.user_id == current_user.id,
                NotificationModel.task_id == task_id,
                NotificationModel.is_read == False,  # noqa: E712
            )
            .update({"is_read": True})
        )
        self.db.commit()
        return {"success": True, "updated": updated}

    def delete(self, current_user: UserModel, notification_id: int) -> dict:
        notification = (
            self.db.query(NotificationModel)
            .filter(
                NotificationModel.id == notification_id,
                NotificationModel.user_id == current_user.id,
            )
            .first()
        )
        if not notification:
            raise NotificationServiceError("Уведомление не найдено", 404)

        self.db.delete(notification)
        self.db.commit()
        return {"success": True, "message": "Уведомление удалено"}

    def send(self, admin: UserModel, request: PushNotificationRequest) -> dict:
        tenant = TenantFilter(admin)

        # Determine target users
        target_user_ids: List[int] = []
        if request.user_ids:
            if not tenant.is_superadmin:
                users = (
                    self.db.query(UserModel)
                    .filter(UserModel.id.in_(request.user_ids))
                    .all()
                )
                if len(users) != len(request.user_ids):
                    raise NotificationServiceError(
                        "Некоторые пользователи не найдены", 404
                    )
                for target_user in users:
                    tenant.enforce_access(
                        target_user,
                        detail="Нельзя отправить уведомление пользователю из другой организации",
                    )
            target_user_ids = list(request.user_ids)
        else:
            # All active users in org
            q = self.db.query(UserModel.id).filter(
                UserModel.is_active == True  # noqa: E712
            )
            if admin.organization_id is not None and not tenant.is_superadmin:
                q = q.filter(UserModel.organization_id == admin.organization_id)
            target_user_ids = [uid for (uid,) in q.all()]

        # 1. FCM path
        fcm_result = _send_push_sync(
            title=request.title,
            body=request.body,
            notification_type=request.notification_type,
            task_id=request.task_id,
            user_ids=request.user_ids,
            organization_id=admin.organization_id,
        )

        # 2. WebSocket path — create persistent notification for each user
        ws_sent = 0
        for uid in target_user_ids:
            create_notification(
                db=self.db,
                user_id=uid,
                title=request.title,
                message=request.body,
                notification_type=request.notification_type or "general",
                task_id=request.task_id,
            )
            ws_sent += 1

        return {
            "success": True,
            "sent_fcm": fcm_result.get("sent", 0),
            "failed_fcm": fcm_result.get("failed", 0),
            "sent_ws": ws_sent,
        }

    def send_test(self, admin: UserModel) -> dict:
        title = "🔔 Тестовое уведомление"
        body = "Push-уведомления работают!"

        # 1. FCM path
        fcm_result = _send_push_sync(
            title=title,
            body=body,
            notification_type="general",
            organization_id=admin.organization_id,
        )

        # 2. WebSocket path — all active users in org
        q = self.db.query(UserModel).filter(UserModel.is_active == True)  # noqa: E712
        if admin.organization_id is not None:
            q = q.filter(UserModel.organization_id == admin.organization_id)
        users = q.all()

        ws_sent = 0
        for user in users:
            create_notification(
                db=self.db,
                user_id=user.id,
                title=title,
                message=body,
                notification_type="general",
            )
            ws_sent += 1

        return {
            "success": True,
            "sent_fcm": fcm_result.get("sent", 0),
            "failed_fcm": fcm_result.get("failed", 0),
            "sent_ws": ws_sent,
        }


def get_notification_service(db: Session = Depends(get_db)) -> NotificationService:
    return NotificationService(db)
