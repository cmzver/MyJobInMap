"""
Tasks API — core
================
CRUD заявок, список с фильтрами/сортировкой, сводка, смена статуса,
плановая дата и назначение исполнителя.
"""

import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
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
    TaskListResponse,
    TaskResponse,
    TaskStatusUpdate,
    TaskSummaryResponse,
)
from app.services import (
    TaskService,
    TaskServiceError,
    check_permission,
    get_task_service,
    require_permission,
)
from app.services.role_utils import is_dispatcher_or_admin_user, is_worker_user
from app.services.tenant_filter import TenantFilter
from app.services.websocket_manager import (
    broadcast_task_assigned,
    broadcast_task_created,
    broadcast_task_deleted,
    broadcast_task_status_changed,
)
from app.utils import (
    get_priority_rank,
    normalize_priority_value,
    priority_rank_expr,
    task_to_list_response,
    task_to_response,
)

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])
logger = logging.getLogger(__name__)


@router.post("", response_model=TaskResponse)
async def create_task(
    task: TaskCreate,
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
        # Multi-tenant: привязать заявку к организации пользователя
        tenant = TenantFilter(user)
        tenant.set_org_id(db_task)
        db.commit()
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    logger.info(f"Заявка №{db_task.task_number} создана")

    # WebSocket broadcast
    asyncio.ensure_future(
        broadcast_task_created(
            task_id=db_task.id,
            task_number=db_task.task_number or "",
            title=db_task.title or "",
            user_id=user.id,
            organization_id=db_task.organization_id,
        )
    )

    return task_to_response(db_task)


@router.get("", response_model=PaginatedResponse[TaskListResponse])
async def get_tasks(
    page: int = 1,
    size: int = 20,
    status: List[TaskStatus] = Query(default=[]),
    priority: List[str] = Query(default=[]),
    assignee_id: List[int] = Query(default=[]),
    search: Optional[str] = None,
    address_id: Optional[int] = None,
    sort: Optional[str] = None,
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

    # Считаем общее количество
    total = query.count()

    sort_value = (sort or "").strip().lower()

    if sort_value == "created_at_asc":
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


@router.get("/summary", response_model=TaskSummaryResponse)
async def get_tasks_summary(
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
async def get_task(
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
    task_service=Depends(get_task_service),
):
    """Изменить статус заявки."""

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

    return task_to_response(updated_task)


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
async def update_planned_date(
    task_id: int,
    planned_date_update: PlannedDateUpdate,
    access: TaskAccess = Depends(
        require_task_access("edit_tasks", worker_detail="Нет доступа к этой заявке")
    ),
    task_service=Depends(get_task_service),
):
    """Изменить плановую дату заявки."""

    try:
        updated_task = task_service.update_planned_date(
            task_id=task_id,
            planned_date=planned_date_update.planned_date,
            user=access.user,
        )
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return task_to_list_response(updated_task)


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
