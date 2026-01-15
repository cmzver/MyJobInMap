"""
Tasks API
=========
Эндпоинты для работы с заявками.
"""

import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models import (
    UserModel, TaskModel, CommentModel,
    TaskStatus, TaskPriority, UserRole, get_db
)
from app.schemas import (
    TaskCreate, TaskStatusUpdate, TaskAssignRequest, PlannedDateUpdate,
    TaskResponse, TaskListResponse,
    PaginatedResponse,
    CommentCreate, CommentResponse
)
from app.services import (
    geocoding_service,
    require_permission,
    check_permission,
    TaskServiceError,
    get_task_service
)
from app.services.task_parser import parse_dispatcher_message
from app.api.deps import require_task_access, TaskAccess
from app.utils import task_to_response, task_to_list_response


router = APIRouter(prefix="/api/tasks", tags=["Tasks"])
logger = logging.getLogger(__name__)


@router.post("", response_model=TaskResponse)
async def create_task(
    task: TaskCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("create_tasks")),
    task_service=Depends(get_task_service)
):
    """Создать новую заявку"""
    if task.assigned_user_id and not check_permission(db, user, 'assign_tasks'):
        raise HTTPException(status_code=403, detail="Нет прав на назначение задач")

    try:
        db_task = task_service.create(task, user=user)
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    logger.info(f"? ?????? ?{db_task.task_number} ???????")

    return task_to_response(db_task)


@router.get("", response_model=PaginatedResponse[TaskListResponse])
async def get_tasks(
    page: int = 1,
    size: int = 20,
    status: Optional[TaskStatus] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks"))
):
    """Получить список заявок с пагинацией
    
    Требует авторизации. Возвращает 401 если пользователь не авторизован или удалён.
    
    - Workers: видят только свои заявки
    - Dispatchers/Admins: видят все заявки (можно фильтровать по assignee_id)
    """
    # Проверка права на просмотр заявок
    
    query = db.query(TaskModel)
    
    if status:
        query = query.filter(TaskModel.status == status.value)

    if priority:
        priority_value = None
        if priority.isdigit():
            priority_value = int(priority)
        else:
            try:
                priority_value = TaskPriority[priority].value
            except KeyError:
                priority_value = None
        if priority_value:
            query = query.filter(TaskModel.priority == priority_value)

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(or_(
            TaskModel.task_number.ilike(search_pattern),
            TaskModel.title.ilike(search_pattern),
            TaskModel.raw_address.ilike(search_pattern),
            TaskModel.description.ilike(search_pattern),
            TaskModel.customer_name.ilike(search_pattern),
            TaskModel.customer_phone.ilike(search_pattern),
        ))
    
    # Workers see only their tasks
    # Dispatchers and Admins can see all (optionally filter by assignee_id)
    if user.role == UserRole.WORKER.value:
        query = query.filter(TaskModel.assigned_user_id == user.id)
    elif assignee_id is not None:
        query = query.filter(TaskModel.assigned_user_id == assignee_id)
    # else: admin/dispatcher without filter - show all
    
    # Считаем общее количество
    total = query.count()
    
    # Применяем пагинацию
    tasks = query.order_by(
        TaskModel.priority.desc(),
        TaskModel.created_at.desc()
    ).offset((page - 1) * size).limit(size).all()
    
    return PaginatedResponse(
        items=[task_to_list_response(t) for t in tasks],
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size
    )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    access: TaskAccess = Depends(require_task_access("view_tasks", worker_detail="Нет доступа к этой заявке"))
):
    """Получить заявку по ID"""
    
    
    return task_to_response(access.task)


@router.put("/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: int,
    status_update: TaskStatusUpdate,
    access: TaskAccess = Depends(require_task_access("change_task_status", worker_detail="Нет доступа к этой заявке")),
    task_service=Depends(get_task_service)
):
    """Изменить статус заявки."""


    try:
        updated_task = task_service.update_status(
            task_id=task_id,
            new_status=status_update.status.value,
            comment_text=status_update.comment,
            user=access.user
        )
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return task_to_response(updated_task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("delete_tasks")),
    task_service=Depends(get_task_service)
):
    """Удалить заявку"""
    try:
        task_service.delete(task_id)
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"message": "Task deleted", "id": task_id}


@router.put("/{task_id}/planned-date", response_model=TaskListResponse)
async def update_planned_date(
    task_id: int,
    planned_date_update: PlannedDateUpdate,
    access: TaskAccess = Depends(require_task_access("edit_tasks", worker_detail="Нет доступа к этой заявке")),
    task_service=Depends(get_task_service)
):
    """Изменить плановую дату заявки."""


    try:
        updated_task = task_service.update_planned_date(
            task_id=task_id,
            planned_date=planned_date_update.planned_date,
            user=access.user
        )
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return task_to_list_response(updated_task)


# ============================================================================
# Comments
# ============================================================================

@router.post("/{task_id}/comments", response_model=CommentResponse)
async def add_comment(
    task_id: int,
    comment: CommentCreate,
    access: TaskAccess = Depends(require_task_access("add_comments", worker_detail="Нет доступа к этой заявке")),
    db: Session = Depends(get_db)
):
    """Добавить комментарий"""
    task = access.task
    user = access.user
    
    # Use full_name or fallback to username
    author = user.full_name or user.username
    
    db_comment = CommentModel(
        task_id=task_id,
        text=comment.text,
        author=author,
        author_id=user.id
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    
    # Send push notification to assigned user (if not the author)
    from app.utils import send_comment_notification
    send_comment_notification(task, comment.text, user.id)
    
    return db_comment


@router.get("/{task_id}/comments", response_model=List[CommentResponse])
async def get_comments(
    task_id: int,
    access: TaskAccess = Depends(require_task_access("view_comments", worker_detail="Нет доступа к этой заявке")),
    db: Session = Depends(get_db)
):
    """Получить комментарии"""
    # Проверка права на просмотр комментариев
    
    
    
    return db.query(CommentModel).filter(
        CommentModel.task_id == task_id
    ).order_by(CommentModel.created_at.desc()).all()


@router.put("/{task_id}/assign", response_model=TaskResponse)
async def assign_task(
    task_id: int,
    assignee_data: TaskAssignRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
    task_service=Depends(get_task_service)
):
    """Назначить заявку исполнителю."""

    try:
        task = task_service.assign(task_id, assignee_data.assigned_user_id, user)
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return task_to_response(task)


# ============================================================================
# Task Parser (из сообщений диспетчерской)
# ============================================================================

from pydantic import BaseModel

class ParseTaskRequest(BaseModel):
    """Запрос на парсинг сообщения диспетчерской"""
    text: str

class ParsedTaskResponse(BaseModel):
    """Ответ с распарсенными данными заявки"""
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None


class CreateTaskFromTextRequest(BaseModel):
    """Запрос на создание заявки из текстового сообщения"""
    text: str
    source: Optional[str] = None  # telegram, web
    sender: Optional[str] = None  # Отправитель (имя/номер)
    assigned_user_id: Optional[int] = None  # Назначить исполнителя


class CreateTaskFromTextResponse(BaseModel):
    """Ответ на создание заявки из текста"""
    success: bool
    task: Optional[TaskResponse] = None
    parsed_data: Optional[dict] = None
    error: Optional[str] = None


@router.post("/parse", response_model=ParsedTaskResponse)
async def parse_task_text(
    request: ParseTaskRequest,
    user: UserModel = Depends(require_permission("create_tasks"))
):
    """
    Парсинг текста сообщения диспетчерской в структуру заявки.
    
    Поддерживаемые форматы:
    - Диспетчерский: №1173544 Текущая. Адрес, подъезд 1. Категория. Описание. кв.45 +79110000000
    - Стандартный: Адрес\\nОписание
    
    Возвращает распарсенные данные для предварительного просмотра перед созданием.
    """
    if not request.text or len(request.text.strip()) < 5:
        return ParsedTaskResponse(
            success=False,
            error="Текст сообщения слишком короткий"
        )
    
    result = parse_dispatcher_message(request.text)
    
    return ParsedTaskResponse(
        success=result["success"],
        data=result.get("data"),
        error=result.get("error")
    )


@router.post("/from-text", response_model=CreateTaskFromTextResponse)
async def create_task_from_text(
    request: CreateTaskFromTextRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("create_tasks"))
):
    """
    Создание заявки из текстового сообщения (для ботов и импорта).
    
    Парсит текст, извлекает данные и создаёт заявку одним запросом.
    
    Поддерживаемые форматы:
    - Диспетчерский: №1173544 Текущая. Адрес, подъезд 1. Категория. Описание. кв.45 +79110000000
    - Стандартный: Адрес\\nОписание
    
    Args:
        text: Текст сообщения
        source: Источник (telegram, web)
        sender: Отправитель (для логирования)
        assigned_user_id: ID исполнителя для назначения
    
    Returns:
        Созданная заявка или ошибка парсинга
    """
    if not request.text or len(request.text.strip()) < 5:
        return CreateTaskFromTextResponse(
            success=False,
            error="Текст сообщения слишком короткий"
        )
    if request.assigned_user_id and not check_permission(db, user, 'assign_tasks'):
        raise HTTPException(status_code=403, detail="Нет прав на назначение задач")
    
    # Парсим текст
    parse_result = parse_dispatcher_message(request.text)
    
    if not parse_result["success"]:
        return CreateTaskFromTextResponse(
            success=False,
            error=parse_result.get("error", "Не удалось распознать формат сообщения")
        )
    
    parsed = parse_result["data"]
    
    # Добавляем информацию об источнике в описание
    description = parsed.get("description", "")
    if request.source or request.sender:
        source_info = []
        if request.source:
            source_info.append(f"Источник: {request.source}")
        if request.sender:
            source_info.append(f"От: {request.sender}")
        description = f"{description}\n---\n{' | '.join(source_info)}"
    
    # Геокодируем адрес
    address = parsed.get("address", "")
    lat, lon = geocoding_service.geocode(address)
    
    # Определяем номер заявки
    external_id = parsed.get("external_id")
    task_number = external_id  # Используем номер из диспетчерской если есть
    
    # Проверяем исполнителя
    assigned_id = request.assigned_user_id
    if assigned_id:
        assigned_user = db.query(UserModel).filter(UserModel.id == assigned_id).first()
        if not assigned_user:
            assigned_id = None
    
    # Создаём заявку
    db_task = TaskModel(
        title=parsed.get("title", "Новая заявка"),
        raw_address=address,
        description=description,
        lat=lat,
        lon=lon,
        status=TaskStatus.NEW.value,
        priority=parsed.get("priority", 2),
        assigned_user_id=assigned_id,
    )
    
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    
    # Генерируем номер заявки
    db_task.task_number = task_number if task_number else f"Z-{db_task.id:05d}"
    db.commit()
    db.refresh(db_task)
    
    source_log = f" [{request.source}]" if request.source else ""
    logger.info(f"✅ Заявка №{db_task.task_number} создана из текста{source_log}")
    
    return CreateTaskFromTextResponse(
        success=True,
        task=task_to_response(db_task),
        parsed_data=parsed
    )

