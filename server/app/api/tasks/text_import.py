"""
Tasks API — text import
=======================
Парсинг сообщений диспетчерской и создание заявки из текста (боты, импорт).
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models import (
    CommentModel,
    TaskModel,
    TaskPriority,
    TaskStatus,
    UserModel,
    get_db,
)
from app.schemas import (
    CreateTaskFromTextRequest,
    CreateTaskFromTextResponse,
    ParsedTaskResponse,
    ParseTaskRequest,
)
from app.services import check_permission, require_permission
from app.services.task_parser import parse_dispatcher_message
from app.services.task_service import TaskService
from app.services.tenant_filter import TenantFilter
from app.services.websocket_manager import (
    broadcast_task_assigned,
    broadcast_task_created,
)
from app.utils import task_to_response

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])
logger = logging.getLogger(__name__)


@router.post("/parse", response_model=ParsedTaskResponse)
async def parse_task_text(
    request: ParseTaskRequest,
    user: UserModel = Depends(require_permission("create_tasks")),
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
            success=False, error="Текст сообщения слишком короткий"
        )

    result = parse_dispatcher_message(request.text)

    return ParsedTaskResponse(
        success=result["success"], data=result.get("data"), error=result.get("error")
    )


@router.post("/from-text", response_model=CreateTaskFromTextResponse)
async def create_task_from_text(
    request: CreateTaskFromTextRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("create_tasks")),
):
    """
    Создание заявки из текстового сообщения (для ботов и импорта).

    Парсит текст, извлекает данные и создаёт заявку одним запросом.
    Если заявка с таким номером уже существует — добавляет комментарий
    с дополненным текстом вместо создания дубликата.

    Поддерживаемые форматы:
    - Диспетчерский: №1173544 Текущая. Адрес, подъезд 1. Категория. Описание. кв.45 +79110000000
    - Стандартный: Адрес\\nОписание

    Args:
        text: Текст сообщения
        source: Источник (telegram, web)
        sender: Отправитель (для логирования)
        assigned_user_id: ID исполнителя для назначения
        assigned_username: Username исполнителя (альтернатива ID)

    Returns:
        Созданная/дополненная заявка или ошибка парсинга
    """
    if not request.text or len(request.text.strip()) < 5:
        return CreateTaskFromTextResponse(
            success=False, error="Текст сообщения слишком короткий"
        )

    has_assign = request.assigned_user_id or request.assigned_username
    if has_assign and not check_permission(db, user, "assign_tasks"):
        raise HTTPException(status_code=403, detail="Нет прав на назначение задач")

    # Парсим текст
    parse_result = parse_dispatcher_message(request.text)

    if not parse_result["success"]:
        return CreateTaskFromTextResponse(
            success=False,
            error=parse_result.get("error", "Не удалось распознать формат сообщения"),
        )

    parsed = parse_result["data"]
    external_id = parsed.get("external_id")
    tenant = TenantFilter(user)

    # --- Резолвим исполнителя (по ID или username) ---
    assigned_id = request.assigned_user_id
    resolved_assignee: Optional[UserModel] = None
    if not assigned_id and request.assigned_username:
        assigned_user = (
            db.query(UserModel)
            .filter(
                UserModel.username == request.assigned_username,
                UserModel.is_active.is_(True),
            )
            .first()
        )
        if assigned_user:
            try:
                tenant.enforce_access(
                    assigned_user,
                    detail="Нельзя назначить пользователя из другой организации",
                )
                assigned_id = assigned_user.id
                resolved_assignee = assigned_user
            except HTTPException:
                logger.warning(
                    f"Пользователь {request.assigned_username} из другой организации, "
                    "назначение пропущено"
                )
        else:
            logger.warning(
                f"Пользователь {request.assigned_username} не найден, "
                "назначение пропущено"
            )
    elif assigned_id:
        assigned_user = db.query(UserModel).filter(UserModel.id == assigned_id).first()
        if not assigned_user:
            assigned_id = None
        else:
            tenant.enforce_access(
                assigned_user,
                detail="Нельзя назначить пользователя из другой организации",
            )
            resolved_assignee = assigned_user

    # --- Дедупликация: ищем существующую заявку по external_id ---
    if external_id:
        existing_query = db.query(TaskModel).filter(
            TaskModel.task_number == external_id,
        )
        existing_query = tenant.apply(existing_query, TaskModel)
        existing_task = existing_query.first()

        if existing_task:
            # Заявка с таким номером уже есть — добавляем комментарий
            comment_author = (
                f"Telegram: {request.sender}" if request.sender else "Telegram бот"
            )
            comment = CommentModel(
                task_id=existing_task.id,
                text=request.text,
                author=comment_author,
            )
            db.add(comment)

            # Если заявка ещё не назначена, а мы знаем исполнителя — назначаем
            auto_assigned = False
            if assigned_id and not existing_task.assigned_user_id:
                existing_task.assigned_user_id = assigned_id
                assigned_user_obj = resolved_assignee or (
                    db.query(UserModel).filter(UserModel.id == assigned_id).first()
                )
                assign_name = (
                    assigned_user_obj.full_name or assigned_user_obj.username
                    if assigned_user_obj
                    else str(assigned_id)
                )
                assign_comment = CommentModel(
                    task_id=existing_task.id,
                    text=f"Автоназначение: → {assign_name}",
                    author="Система",
                    new_assignee=assign_name,
                )
                db.add(assign_comment)
                auto_assigned = True

            db.commit()
            db.refresh(existing_task)

            # Уведомления при автоназначении
            if auto_assigned and assigned_user_obj:
                from app.services.notification_service import (
                    create_task_assignment_notification,
                )

                create_task_assignment_notification(
                    db=db,
                    task=existing_task,
                    assigned_to=assigned_user_obj,
                    assigned_by=user,
                )
                asyncio.ensure_future(
                    broadcast_task_assigned(
                        task_id=existing_task.id,
                        task_number=existing_task.task_number or "",
                        assigned_user_id=assigned_id,
                        assigned_user_name=assign_name,
                        user_id=user.id,
                        organization_id=existing_task.organization_id,
                    )
                )

            source_log = f" [{request.source}]" if request.source else ""
            logger.info(
                f"📝 Заявка №{existing_task.task_number} дополнена комментарием{source_log}"
            )

            return CreateTaskFromTextResponse(
                success=True,
                task=task_to_response(existing_task),
                parsed_data=parsed,
                updated_existing=True,
            )

    # --- Создание новой заявки ---
    # Добавляем информацию об источнике в описание
    description = parsed.get("description", "")
    if request.source or request.sender:
        source_info = []
        if request.source:
            source_info.append(f"Источник: {request.source}")
        if request.sender:
            source_info.append(f"От: {request.sender}")
        description = f"{description}\n---\n{' | '.join(source_info)}"

    # Геокодируем адрес (через резолвер — матчит к адресной книге и привязывает
    # заявку к адресу, чтобы правка его координат подхватывалась автоматически).
    address = parsed.get("address", "")
    lat, lon, address_id = TaskService(db).resolve_coordinates(
        address, user.organization_id
    )

    task_number = external_id

    # Создаём заявку
    db_task = TaskModel(
        title=parsed.get("title", "Новая заявка"),
        raw_address=address,
        description=description,
        lat=lat,
        lon=lon,
        address_id=address_id,
        status=TaskStatus.NEW.value,
        priority=parsed.get("priority", TaskPriority.CURRENT.value),
        assigned_user_id=assigned_id,
    )

    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    tenant.set_org_id(db_task)
    db.commit()
    db.refresh(db_task)

    # Генерируем номер заявки
    db_task.task_number = task_number if task_number else f"Z-{db_task.id:05d}"
    db.commit()
    db.refresh(db_task)

    source_log = f" [{request.source}]" if request.source else ""
    logger.info(f"✅ Заявка №{db_task.task_number} создана из текста{source_log}")

    # WebSocket broadcast о новой заявке
    asyncio.ensure_future(
        broadcast_task_created(
            task_id=db_task.id,
            task_number=db_task.task_number or "",
            title=db_task.title or "",
            user_id=user.id,
            organization_id=db_task.organization_id,
        )
    )

    # Уведомление исполнителю (DB + FCM push)
    if assigned_id and resolved_assignee:
        from app.services.notification_service import (
            create_task_assignment_notification,
        )

        create_task_assignment_notification(
            db=db,
            task=db_task,
            assigned_to=resolved_assignee,
            assigned_by=user,
        )
        asyncio.ensure_future(
            broadcast_task_assigned(
                task_id=db_task.id,
                task_number=db_task.task_number or "",
                assigned_user_id=assigned_id,
                assigned_user_name=(
                    resolved_assignee.full_name or resolved_assignee.username
                ),
                user_id=user.id,
                organization_id=db_task.organization_id,
            )
        )

    return CreateTaskFromTextResponse(
        success=True, task=task_to_response(db_task), parsed_data=parsed
    )
