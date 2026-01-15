"""
Utils Package
=============
Вспомогательные функции.
"""

from typing import Dict, Any, List
from app.models import TaskModel, UserModel
from app.schemas import TaskResponse, TaskListResponse, CommentResponse, UserResponse

# ============================================
# Константы (общие для всего приложения)
# ============================================

STATUS_DISPLAY_NAMES: Dict[str, str] = {
    "NEW": "Новая",
    "IN_PROGRESS": "В работе",
    "DONE": "Выполнена",
    "CANCELLED": "Отменена",
}

PRIORITY_DISPLAY_NAMES: Dict[int, str] = {
    1: "Плановая",
    2: "Текущая",
    3: "Срочная",
    4: "Аварийная",
}


def get_status_display_name(status: str) -> str:
    """Получить русское название статуса"""
    return STATUS_DISPLAY_NAMES.get(status, status)


def get_priority_display_name(priority: int) -> str:
    """Получить русское название приоритета"""
    return PRIORITY_DISPLAY_NAMES.get(priority, str(priority))

def _base_task_dict(task: TaskModel) -> Dict[str, Any]:
    """
    Базовые поля для Task response.
    Устраняет дублирование между task_to_response и task_to_list_response.
    """
    return {
        "id": task.id,
        "task_number": task.task_number or f"Z-{task.id:05d}",
        "title": task.title,
        "raw_address": task.raw_address,
        "description": task.description,
        "customer_name": task.customer_name,
        "customer_phone": task.customer_phone,
        "lat": task.lat,
        "lon": task.lon,
        "status": task.status,
        "priority": task.priority,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "completed_at": task.completed_at,
        "planned_date": task.planned_date,
        "assigned_user_id": task.assigned_user_id,
        "assigned_user_name": (task.assigned_user.full_name or task.assigned_user.username) if task.assigned_user else None,
        "is_remote": task.is_remote or False,
        "is_paid": task.is_paid or False,
        "payment_amount": task.payment_amount or 0.0,
        # Система и тип неисправности
        "system_id": task.system_id,
        "system_type": task.system_type,
        "defect_type": task.defect_type,
    }


def _comments_to_response(comments: List) -> List[CommentResponse]:
    """Конвертация списка комментариев в Response"""
    return [
        CommentResponse(
            id=c.id,
            task_id=c.task_id,
            text=c.text,
            author=c.author,
            author_id=c.author_id,
            old_status=c.old_status,
            new_status=c.new_status,
            old_assignee=c.old_assignee,
            new_assignee=c.new_assignee,
            created_at=c.created_at
        ) for c in (comments or [])
    ]


def task_to_response(task: TaskModel) -> TaskResponse:
    """Конвертация Task в полный Response с комментариями"""
    data = _base_task_dict(task)
    data["comments"] = _comments_to_response(task.comments)
    return TaskResponse(**data)


def task_to_list_response(task: TaskModel) -> TaskListResponse:
    """Конвертация Task в ListResponse с количеством комментариев"""
    data = _base_task_dict(task)
    data["comments_count"] = len(task.comments) if task.comments else 0
    return TaskListResponse(**data)


def user_to_response(user: UserModel) -> UserResponse:
    """Конвертация User в Response - устраняет дублирование в API"""
    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name or "",
        email=user.email,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        assigned_tasks_count=len(user.assigned_tasks) if user.assigned_tasks else 0
    )


# ============================================
# Push Notification Helpers
# ============================================

def send_task_assignment_notification(
    task: TaskModel,
    new_assignee_id: int,
    old_assignee_id: int = None
) -> None:
    """
    Отправка уведомления о назначении заявки.
    Вызывает send_push_notification из services.
    """
    from app.services import send_push_notification
    
    if not new_assignee_id or new_assignee_id == old_assignee_id:
        return
    
    priority_name = get_priority_display_name(task.priority)
    title = f"Новая заявка ({priority_name})" if task.priority >= 3 else "Вам назначена заявка"
    
    send_push_notification(
        title=title,
        body=f"№{task.task_number}: {task.title[:50]}...",
        notification_type="task_assigned",
        task_id=task.id,
        user_ids=[new_assignee_id]
    )


def send_comment_notification(
    task: TaskModel,
    comment_text: str,
    author_user_id: int
) -> None:
    """
    Отправка уведомления о новом комментарии.
    Не отправляет уведомление автору комментария.
    """
    from app.services import send_push_notification
    
    if not task.assigned_user_id or author_user_id == task.assigned_user_id:
        return
    
    send_push_notification(
        title="Новый комментарий",
        body=f"№{task.task_number}: {comment_text[:50]}...",
        notification_type="new_comment",
        task_id=task.id,
        user_ids=[task.assigned_user_id]
    )
