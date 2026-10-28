"""
Tasks API — comments
====================
Добавление и просмотр комментариев к заявке.
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.api.deps import TaskAccess, require_task_access
from app.models import CommentModel, get_db
from app.schemas import CommentCreate, CommentResponse
from app.services.idempotency import cached_response, stage_response

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.post("/{task_id}/comments", response_model=CommentResponse)
async def add_comment(
    task_id: int,
    comment: CommentCreate,
    access: TaskAccess = Depends(
        require_task_access("add_comments", worker_detail="Нет доступа к этой заявке")
    ),
    idempotency_key: Optional[str] = Header(
        None,
        alias="Idempotency-Key",
        max_length=64,
        description="Повтор с тем же ключом вернёт сохранённый ответ (Android-outbox).",
    ),
    db: Session = Depends(get_db),
):
    """Добавить комментарий"""
    task = access.task
    user = access.user
    scope = f"comment:{task_id}"
    cached = cached_response(db, user.id, idempotency_key, scope)
    if cached is not None:
        return cached

    # Use full_name or fallback to username
    author = user.full_name or user.username

    db_comment = CommentModel(
        task_id=task_id, text=comment.text, author=author, author_id=user.id
    )
    db.add(db_comment)
    # comments_count входит в список заявок — инкрементальная синхронизация
    # (updated_since) должна увидеть заявку изменённой.
    task.updated_at = datetime.now(timezone.utc)
    if idempotency_key:
        db.flush()  # нужен id комментария для сохранённого ответа
        stage_response(
            db,
            user.id,
            idempotency_key,
            scope,
            CommentResponse.model_validate(db_comment),
        )
    db.commit()
    db.refresh(db_comment)

    # In-app уведомление + FCM push
    from app.services.notification_service import create_comment_notification
    from app.utils import send_comment_notification

    create_comment_notification(db, task, comment.text, user)
    send_comment_notification(task, comment.text, user.id)

    return db_comment


@router.get("/{task_id}/comments", response_model=List[CommentResponse])
async def get_comments(
    task_id: int,
    access: TaskAccess = Depends(
        require_task_access("view_comments", worker_detail="Нет доступа к этой заявке")
    ),
    db: Session = Depends(get_db),
):
    """Получить комментарии"""
    # Проверка права на просмотр комментариев

    return (
        db.query(CommentModel)
        .filter(CommentModel.task_id == task_id)
        .order_by(CommentModel.created_at.desc())
        .all()
    )
