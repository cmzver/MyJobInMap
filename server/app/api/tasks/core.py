"""
Tasks API — core
================
CRUD заявок, список с фильтрами/сортировкой, сводка, смена статуса,
плановая дата и назначение исполнителя.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload, subqueryload

from app.api.addresses import build_task_filters_for_address
from app.api.deps import TaskAccess, require_task_access
from app.models import (
    NotificationModel,
    TaskModel,
    TaskStatus,
    UserModel,
    get_db,
)
from app.models.address import AddressModel
from app.schemas import (
    PaginatedResponse,
    PlannedDateUpdate,
    TaskAssignRequest,
    TaskCreate,
    TaskIdsResponse,
    TaskListResponse,
    TaskResponse,
    TaskStatusUpdate,
    TaskSummaryResponse,
)
from app.services import (
    TaskService,
    TaskServiceError,
    chat_service,
    check_permission,
    get_task_service,
    metrics,
    require_permission,
)
from app.services.idempotency import (
    IdempotencyKey,
    cached_response,
    remember_response,
)
from app.services.notification_service import (
    broadcast_created_notification_async,
    create_task_assignment_notification,
    notification_broadcast_payload,
    send_task_assignment_push,
)
from app.services.role_utils import is_dispatcher_or_admin_user, is_worker_user
from app.services.tenant_filter import TenantFilter
from app.services.websocket_manager import (
    broadcast_chat_message,
    broadcast_task_assigned,
    broadcast_task_created,
    broadcast_task_deleted,
    broadcast_task_status_changed,
)
from app.utils import (
    get_priority_rank,
    get_status_display_name,
    normalize_priority_value,
    priority_rank_expr,
    task_to_list_response,
    task_to_response,
)

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])
logger = logging.getLogger(__name__)


@router.post("", response_model=TaskResponse)
def create_task(
    task: TaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("create_tasks")),
    task_service=Depends(get_task_service),
):
    """Создать новую заявку"""
    if task.assigned_user_id and not check_permission(db, user, "assign_tasks"):
        raise HTTPException(status_code=403, detail="Нет прав на назначение задач")

    # Multi-tenant: проверка лимита заявок организации
    if user.organization_id and user.organization:
        org = user.organization
        if org.max_tasks:
            current_count = (
                db.query(func.count(TaskModel.id))
                .filter(TaskModel.organization_id == user.organization_id)
                .scalar()
                or 0
            )
            if current_count >= org.max_tasks:
                raise HTTPException(
                    status_code=400,
                    detail=f"Достигнут лимит заявок организации ({org.max_tasks})",
                )

    try:
        db_task = task_service.create(task, user=user)
        assignment_notifications = []
        assigned_to = None
        if db_task.assigned_user_id:
            assigned_to = db.get(UserModel, db_task.assigned_user_id)
            if assigned_to:
                assignment_notifications = create_task_assignment_notification(
                    db=db,
                    task=db_task,
                    assigned_to=assigned_to,
                    assigned_by=user,
                    commit=False,
                    send_push=False,
                )
        db.commit()
        db.refresh(db_task)
    except TaskServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except Exception:
        db.rollback()
        raise

    logger.info(f"Заявка №{db_task.task_number} создана")
    metrics.record_task_created(db_task.priority)
    for notification in assignment_notifications:
        notification_user_id, notification_event = notification_broadcast_payload(
            notification
        )
        background_tasks.add_task(
            broadcast_created_notification_async,
            notification_user_id,
            notification_event,
        )
    if assigned_to and assignment_notifications:
        send_task_assignment_push(db_task, assigned_to)

    # WebSocket broadcast
    background_tasks.add_task(
        broadcast_task_created,
        task_id=db_task.id,
        task_number=db_task.task_number or "",
        title=db_task.title or "",
        user_id=user.id,
        organization_id=db_task.organization_id,
    )

    return task_to_response(db_task)


@router.get("", response_model=PaginatedResponse[TaskListResponse])
def get_tasks(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: List[TaskStatus] = Query(default=[]),
    priority: List[str] = Query(default=[]),
    assignee_id: List[int] = Query(default=[]),
    search: Optional[str] = None,
    address_id: Optional[int] = None,
    sort: Optional[str] = None,
    updated_since: Optional[datetime] = Query(
        None,
        description=(
            "Только заявки, изменённые не раньше этого момента (UTC) — для "
            "инкрементальной синхронизации. Порядок: updated_at, id по возрастанию."
        ),
    ),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    """Получить список заявок с пагинацией

    Требует авторизации. Возвращает 401 если пользователь не авторизован или удалён.

    - Workers: видят только свои заявки
    - Dispatchers/Admins: видят все заявки (можно фильтровать по assignee_id)
    """
    # Проверка права на просмотр заявок

    query = db.query(TaskModel)

    # Multi-tenant: фильтрация по организации
    tenant = TenantFilter(user)
    query = tenant.apply(query, TaskModel)

    if status:
        query = query.filter(TaskModel.status.in_([item.value for item in status]))

    if priority:
        priority_values = []
        for raw_priority in priority:
            try:
                normalized_priority = normalize_priority_value(
                    raw_priority, default=None, strict=True
                )
            except ValueError:
                normalized_priority = None
            if normalized_priority:
                rank = get_priority_rank(normalized_priority)
                # priority — VARCHAR (после миграции priority→string). Сравниваем
                # только со строками: имя ("CURRENT") и числовой ранг как строка
                # ("2") для legacy-строк. Голый int сломал бы Postgres
                # (varchar = integer) и на строковой колонке бесполезен.
                priority_values.extend([normalized_priority, str(rank)])
        if priority_values:
            query = query.filter(TaskModel.priority.in_(priority_values))

    if search:
        base = search.strip()
        like_pat = f"%{base}%"
        like_clauses = [
            TaskModel.task_number.ilike(like_pat),
            TaskModel.title.ilike(like_pat),
            TaskModel.raw_address.ilike(like_pat),
            TaskModel.description.ilike(like_pat),
            TaskModel.customer_name.ilike(like_pat),
            TaskModel.customer_phone.ilike(like_pat),
        ]
        query = query.filter(or_(*like_clauses))

    if address_id:
        address = (
            tenant.apply(db.query(AddressModel), AddressModel)
            .filter(AddressModel.id == address_id)
            .first()
        )
        if address:
            filters = build_task_filters_for_address(address)
            if filters:
                query = query.filter(or_(*filters))

    # Workers see only their tasks
    # Dispatchers and Admins can see all (optionally filter by assignee_id)
    if is_worker_user(user):
        query = query.filter(TaskModel.assigned_user_id == user.id)
    elif assignee_id:
        query = query.filter(TaskModel.assigned_user_id.in_(assignee_id))
    # else: admin/dispatcher without filter - show all

    if updated_since is not None:
        query = query.filter(TaskModel.updated_at >= _to_naive_utc(updated_since))

    # Считаем общее количество
    total = query.count()

    sort_value = (sort or "").strip().lower()

    if updated_since is not None:
        # Стабильный порядок для курсора клиента: страницы не «плывут», если
        # во время выгрузки кто-то поменял приоритет/статус.
        order_by = [TaskModel.updated_at.asc(), TaskModel.id.asc()]
    elif sort_value == "created_at_asc":
        # Явная сортировка по дате — без поднятия непрочитанных, чтобы
        # порядок соответствовал выбранному пользователем «по дате».
        order_by = [TaskModel.created_at.asc()]
    elif sort_value == "created_at_desc":
        order_by = [TaskModel.created_at.desc()]
    else:
        # Дефолтная (без явного sort) «умная» сортировка: заявки с
        # непрочитанными уведомлениями и более высоким приоритетом — наверх.
        prioritize_unread_notifications = is_dispatcher_or_admin_user(user)
        has_unread_task_notification = (
            db.query(NotificationModel.id)
            .filter(
                NotificationModel.user_id == user.id,
                NotificationModel.task_id == TaskModel.id,
                NotificationModel.is_read.is_(False),
            )
            .exists()
        )
        order_by = [
            *(
                [case((has_unread_task_notification, 0), else_=1)]
                if prioritize_unread_notifications
                else []
            ),
            priority_rank_expr(TaskModel.priority).desc(),
            TaskModel.created_at.desc(),
        ]

    # Применяем пагинацию + eager loading для устранения N+1
    tasks = (
        query.options(
            joinedload(TaskModel.assigned_user),
            joinedload(TaskModel.created_by),
            subqueryload(TaskModel.comments),
        )
        .order_by(*order_by)
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    return PaginatedResponse(
        items=[task_to_list_response(t) for t in tasks],
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size,
    )


def _to_naive_utc(value: datetime) -> datetime:
    """updated_at хранится как naive UTC; клиент может прислать время со смещением."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


@router.get("/ids", response_model=TaskIdsResponse)
def get_task_ids(
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    """ID всех видимых пользователю заявок (тот же скоуп, что у списка).

    Дешёвая пара к ``updated_since``: по изменённым заявкам клиент не узнает об
    удалённых и переназначенных — их он вычищает, сверяясь с этим списком.
    """
    query = TenantFilter(user).apply(db.query(TaskModel.id), TaskModel)
    if is_worker_user(user):
        query = query.filter(TaskModel.assigned_user_id == user.id)
    return TaskIdsResponse(ids=[row[0] for row in query.all()])


@router.get("/summary", response_model=TaskSummaryResponse)
def get_tasks_summary(
    status: Optional[TaskStatus] = None,
    assignee_id: Optional[int] = None,
    service: TaskService = Depends(get_task_service),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    """Агрегированная сводка по заявкам (количества по статусам/приоритетам)."""
    return service.get_summary(
        user,
        status=status.value if status else None,
        assignee_id=assignee_id,
    )


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    access: TaskAccess = Depends(
        require_task_access("view_tasks", worker_detail="Нет доступа к этой заявке")
    ),
):
    """Получить заявку по ID"""

    return task_to_response(access.task)


@router.patch("/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: int,
    status_update: TaskStatusUpdate,
    access: TaskAccess = Depends(
        require_task_access(
            "change_task_status", worker_detail="Нет доступа к этой заявке"
        )
    ),
    idempotency_key: IdempotencyKey = None,
    task_service=Depends(get_task_service),
):
    """Изменить статус заявки."""

    scope = f"status:{task_id}"
    cached = cached_response(task_service.db, access.user.id, idempotency_key, scope)
    if cached is not None:
        return cached

    old_status = access.task.status
    try:
        updated_task = task_service.update_status(
            task_id=task_id,
            new_status=status_update.status.value,
            comment_text=status_update.comment,
            user=access.user,
        )
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    # WebSocket broadcast
    asyncio.ensure_future(
        broadcast_task_status_changed(
            task_id=task_id,
            task_number=updated_task.task_number or "",
            old_status=old_status,
            new_status=status_update.status.value,
            user_id=access.user.id,
            organization_id=updated_task.organization_id,
        )
    )

    # Системное сообщение в чат заявки (если он существует) + realtime-доставка.
    if old_status != status_update.status.value:
        system_text = (
            f"Статус изменён: {get_status_display_name(old_status)} → "
            f"{get_status_display_name(status_update.status.value)}"
        )
        posted = chat_service.post_task_system_message(
            task_service.db, task_id, access.user.id, system_text
        )
        if posted is not None:
            conv, message_response, member_ids = posted
            asyncio.ensure_future(
                broadcast_chat_message(
                    member_user_ids=member_ids,
                    conversation_id=conv.id,
                    message_data=message_response.model_dump(mode="json"),
                )
            )

    response = task_to_response(updated_task)
    remember_response(task_service.db, access.user.id, idempotency_key, scope, response)
    return response


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("delete_tasks")),
    task_service=Depends(get_task_service),
):
    """Удалить заявку"""
    tenant = TenantFilter(user)

    # Сохраняем номер заявки до удаления
    task_obj = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if task_obj:
        tenant.enforce_access(task_obj, detail="Нет доступа к этой заявке")
    task_number = task_obj.task_number if task_obj else ""
    try:
        task_service.delete(task_id)
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    # WebSocket broadcast
    asyncio.ensure_future(
        broadcast_task_deleted(
            task_id=task_id,
            task_number=task_number,
            user_id=user.id,
            organization_id=task_obj.organization_id if task_obj else None,
        )
    )

    return {"message": "Task deleted", "id": task_id}


@router.patch("/{task_id}/planned-date", response_model=TaskListResponse)
def update_planned_date(
    task_id: int,
    planned_date_update: PlannedDateUpdate,
    access: TaskAccess = Depends(
        require_task_access("edit_tasks", worker_detail="Нет доступа к этой заявке")
    ),
    idempotency_key: IdempotencyKey = None,
    task_service=Depends(get_task_service),
):
    """Изменить плановую дату заявки."""

    scope = f"planned_date:{task_id}"
    cached = cached_response(task_service.db, access.user.id, idempotency_key, scope)
    if cached is not None:
        return cached

    try:
        updated_task = task_service.update_planned_date(
            task_id=task_id,
            planned_date=planned_date_update.planned_date,
            user=access.user,
        )
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    response = task_to_list_response(updated_task)
    remember_response(task_service.db, access.user.id, idempotency_key, scope, response)
    return response


@router.patch("/{task_id}/assign", response_model=TaskResponse)
async def assign_task(
    task_id: int,
    assignee_data: TaskAssignRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
    task_service=Depends(get_task_service),
):
    """Назначить заявку исполнителю."""
    tenant = TenantFilter(user)
    task_obj = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    tenant.enforce_access(task_obj, detail="Нет доступа к этой заявке")

    if assignee_data.assigned_user_id is not None:
        assignee = (
            db.query(UserModel)
            .filter(UserModel.id == assignee_data.assigned_user_id)
            .first()
        )
        if not assignee:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        tenant.enforce_access(
            assignee, detail="Нельзя назначить пользователя из другой организации"
        )

    try:
        task = task_service.assign(task_id, assignee_data.assigned_user_id, user)
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    # WebSocket broadcast
    if assignee_data.assigned_user_id:
        assignee = (
            db.query(UserModel)
            .filter(UserModel.id == assignee_data.assigned_user_id)
            .first()
        )
        assignee_name = (assignee.full_name or assignee.username) if assignee else ""
        asyncio.ensure_future(
            broadcast_task_assigned(
                task_id=task_id,
                task_number=task.task_number or "",
                assigned_user_id=assignee_data.assigned_user_id,
                assigned_user_name=assignee_name,
                user_id=user.id,
                organization_id=task.organization_id,
            )
        )

    return task_to_response(task)
