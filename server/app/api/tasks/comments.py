"""
Tasks API — comments
====================
Добавление и просмотр комментариев к заявке.
"""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import TaskAccess, require_task_access
from app.models import CommentModel, get_db
from app.schemas import CommentCreate, CommentResponse

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.post("/{task_id}/comments", response_model=CommentResponse)
async def add_comment(
    task_id: int,
    comment: CommentCreate,
    access: TaskAccess = Depends(
        require_task_access("add_comments", worker_detail="Нет доступа к этой заявке")
    ),
    db: Session = Depends(get_db),
):
    """Добавить комментарий"""
    task = access.task
    user = access.user

    # Use full_name or fallback to username
    author = user.full_name or user.username

    db_comment = CommentModel(
        task_id=task_id, text=comment.text, author=author, author_id=user.id
    )
    db.add(db_comment)
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
