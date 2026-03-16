"""
Notification Service
====================
Сервис для работы с уведомлениями.
"""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models import NotificationModel, UserModel, TaskModel
from app.utils import get_priority_rank


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str = "system",
    task_id: Optional[int] = None
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
        is_read=False,
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(notification)
    db.commit()
    db.refresh(notification)
    
    return notification


def create_task_status_notification(
    db: Session,
    task: TaskModel,
    old_status: str,
    new_status: str,
    changed_by: UserModel
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
            task_id=task.id
        )
    
    # Если статус изменён на NEW или IN_PROGRESS, уведомляем админов/диспетчеров
    if new_status in ["NEW", "IN_PROGRESS"] and changed_by.role not in ["admin", "dispatcher"]:
        # Получаем всех админов/диспетчеров
        admins = db.query(UserModel).filter(
            UserModel.role.in_(["admin", "dispatcher"]),
            UserModel.is_active == True,  # noqa: E712
            UserModel.id != changed_by.id,
            UserModel.organization_id == task.organization_id,
        ).all()
        
        for admin in admins:
            create_notification(
                db=db,
                user_id=admin.id,
                title=title,
                message=message,
                notification_type=notification_type,
                task_id=task.id
            )


def create_task_assignment_notification(
    db: Session,
    task: TaskModel,
    assigned_to: UserModel,
    assigned_by: UserModel
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
        task_id=task.id
    )
