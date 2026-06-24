"""

Utils Package

=============

Вспомогательные функции.

"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import case, func
from sqlalchemy.orm import object_session

from app.models import TaskModel, TaskPriority, UserModel
from app.schemas import CommentResponse, TaskListResponse, TaskResponse, UserResponse
from app.services.role_utils import public_role_value
from app.services.user_group_service import resolve_base_access, resolve_role_label

# ============================================

# Константы (общие для всего приложения)

# ============================================


STATUS_DISPLAY_NAMES: Dict[str, str] = {
    "NEW": "Новая",
    "IN_PROGRESS": "В работе",
    "DONE": "Выполнена",
    "CANCELLED": "Отменена",
}


PRIORITY_DISPLAY_NAMES: Dict[str, str] = {
    TaskPriority.PLANNED.value: "Плановая",
    TaskPriority.CURRENT.value: "Текущая",
    TaskPriority.URGENT.value: "Срочная",
    TaskPriority.EMERGENCY.value: "Аварийная",
}


PRIORITY_NUMBER_TO_VALUE: Dict[int, str] = {
    1: TaskPriority.PLANNED.value,
    2: TaskPriority.CURRENT.value,
    3: TaskPriority.URGENT.value,
    4: TaskPriority.EMERGENCY.value,
}


PRIORITY_RANKS: Dict[str, int] = {
    TaskPriority.PLANNED.value: 1,
    TaskPriority.CURRENT.value: 2,
    TaskPriority.URGENT.value: 3,
    TaskPriority.EMERGENCY.value: 4,
}


def get_status_display_name(status: str) -> str:
    """Получить русское название статуса"""

    return STATUS_DISPLAY_NAMES.get(status, status)


def get_status_comment_required_message(status: str) -> str:
    """Сообщение о том, что для статуса требуется комментарий"""

    return f"Комментарий обязателен при переводе заявки в статус {get_status_display_name(status)}"


def normalize_priority_value(
    priority: object, default: Optional[str] = None, strict: bool = False
) -> Optional[str]:
    """Normalize priority to string enum value."""

    if priority is None or priority == "":

        return None if strict else (default or TaskPriority.CURRENT.value)

    if isinstance(priority, TaskPriority):

        return priority.value

    if isinstance(priority, int):

        mapped = PRIORITY_NUMBER_TO_VALUE.get(priority)

        if mapped:

            return mapped

        if strict:

            raise ValueError("Invalid priority")

        return default or TaskPriority.CURRENT.value

    if isinstance(priority, str):

        value = priority.strip()

        if not value:

            return None if strict else (default or TaskPriority.CURRENT.value)

        if value.isdigit():

            mapped = PRIORITY_NUMBER_TO_VALUE.get(int(value))

            if mapped:

                return mapped

        upper = value.upper()

        if upper in PRIORITY_DISPLAY_NAMES:

            return upper

        if strict:

            raise ValueError("Invalid priority")

        return default or TaskPriority.CURRENT.value

    if strict:

        raise ValueError("Invalid priority")

    return default or TaskPriority.CURRENT.value


def get_priority_display_name(priority: object) -> str:
    """Get display label for priority."""

    if priority is None or priority == "":

        return ""

    normalized = normalize_priority_value(priority, default=str(priority))

    return PRIORITY_DISPLAY_NAMES.get(normalized, str(priority))


def get_priority_rank(priority: object, default_rank: int = 2) -> int:
    """Get numeric rank for priority (higher is more urgent)."""

    normalized = normalize_priority_value(priority, default=TaskPriority.CURRENT.value)

    return PRIORITY_RANKS.get(normalized, default_rank)


def priority_rank_expr(column) -> object:
    """SQL expression for ordering priorities."""

    # priority — VARCHAR: сравниваем только со строками (имя + числовой ранг как
    # строка для legacy-значений). Голый int ломает Postgres (varchar = integer).
    return case(
        (
            column.in_([TaskPriority.EMERGENCY.value, "4"]),
            PRIORITY_RANKS[TaskPriority.EMERGENCY.value],
        ),
        (
            column.in_([TaskPriority.URGENT.value, "3"]),
            PRIORITY_RANKS[TaskPriority.URGENT.value],
        ),
        (
            column.in_([TaskPriority.CURRENT.value, "2"]),
            PRIORITY_RANKS[TaskPriority.CURRENT.value],
        ),
        (
            column.in_([TaskPriority.PLANNED.value, "1"]),
            PRIORITY_RANKS[TaskPriority.PLANNED.value],
        ),
        else_=PRIORITY_RANKS[TaskPriority.CURRENT.value],
    )


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
        "priority": normalize_priority_value(task.priority),
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "completed_at": task.completed_at,
        "planned_date": task.planned_date,
        "assigned_user_id": task.assigned_user_id,
        "assigned_user_name": (
            (task.assigned_user.full_name or task.assigned_user.username)
            if task.assigned_user
            else None
        ),
        "is_remote": task.is_remote or False,
        "is_paid": task.is_paid or False,
        "payment_amount": task.payment_amount or 0.0,
        # Система и тип неисправности
        "system_id": task.system_id,
        "system_type": task.system_type,
        "defect_type": task.defect_type,
        "organization_id": task.organization_id,
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
            created_at=c.created_at,
        )
        for c in (comments or [])
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


def user_to_response(
    user: UserModel, assigned_tasks_count: Optional[int] = None
) -> UserResponse:
    """Конвертация User в Response - устраняет дублирование в API.

    ``assigned_tasks_count`` можно передать заранее (для списков — чтобы не
    тянуть ленивую связь user.assigned_tasks на каждого пользователя, см.
    user_list_to_responses). Если не передан — считается лениво (1 пользователь).
    """

    session = object_session(user)
    base_access = (
        resolve_base_access(session, user.role, user.organization_id)
        if session is not None
        else "worker"
    )
    role_label = (
        resolve_role_label(session, user.role, user.organization_id)
        if session is not None
        else ""
    )
    if assigned_tasks_count is None:
        assigned_tasks_count = len(user.assigned_tasks) if user.assigned_tasks else 0

    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name or "",
        email=user.email,
        phone=user.phone,
        avatar_url=build_user_avatar_url(user),
        role=public_role_value(user.role, user.organization_id),
        role_label=role_label,
        base_access=base_access,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        assigned_tasks_count=assigned_tasks_count,
        organization_id=user.organization_id,
    )


def user_list_to_responses(users: List[UserModel]) -> List[UserResponse]:
    """Сериализовать список пользователей без N+1.

    Счётчики назначенных заявок берём одним GROUP BY вместо ленивой загрузки
    user.assigned_tasks на каждого пользователя.
    """
    if not users:
        return []
    session = object_session(users[0])
    if session is None:
        return [user_to_response(u) for u in users]

    user_ids = [u.id for u in users]
    counts = dict(
        session.query(TaskModel.assigned_user_id, func.count(TaskModel.id))
        .filter(TaskModel.assigned_user_id.in_(user_ids))
        .group_by(TaskModel.assigned_user_id)
        .all()
    )
    return [
        user_to_response(u, assigned_tasks_count=counts.get(u.id, 0)) for u in users
    ]


def build_user_avatar_url(user: UserModel) -> Optional[str]:
    """Построить публичный URL аватара пользователя."""

    if not user.avatar_path:

        return None

    return f"/api/auth/avatar/{user.id}/{Path(user.avatar_path).name}"


# ============================================

# Push Notification Helpers

# ============================================


def send_comment_notification(
    task: TaskModel, comment_text: str, author_user_id: int
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
        user_ids=[task.assigned_user_id],
    )
