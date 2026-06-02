from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload, subqueryload

from app.models import TaskModel, UserModel, get_db
from app.services import (check_permission, enforce_worker_task_access,
                          get_current_user_required)
from app.services.tenant_filter import TenantFilter


def get_task_or_404(task_id: int, db: Session = Depends(get_db)) -> TaskModel:
    task = (
        db.query(TaskModel)
        .options(
            joinedload(TaskModel.assigned_user),
            subqueryload(TaskModel.comments),
        )
        .filter(TaskModel.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def assert_task_access(
    db: Session,
    user: UserModel,
    task_id: int,
    permission: str = "view_tasks",
    detail: str = "Нет доступа к этой заявке",
) -> TaskModel:
    """Проверить доступ пользователя к заявке по id (для task_id из тела запроса,
    где path-зависимость require_task_access неприменима). Возвращает заявку или 404/403.
    """
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if not check_permission(db, user, permission):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    TenantFilter(user).enforce_access(task, detail=detail)
    enforce_worker_task_access(user, task, detail=detail)
    return task


@dataclass(frozen=True)
class TaskAccess:
    task: TaskModel
    user: UserModel


def require_task_access(
    permission: str,
    detail: str = "Permission denied",
    worker_detail: str = "Access denied",
) -> Callable:
    async def _dependency(
        task: TaskModel = Depends(get_task_or_404),
        user: UserModel = Depends(get_current_user_required),
        db: Session = Depends(get_db),
    ) -> TaskAccess:
        if not check_permission(db, user, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
        tenant = TenantFilter(user)
        tenant.enforce_access(task, detail=worker_detail)
        enforce_worker_task_access(user, task, detail=worker_detail)
        return TaskAccess(task=task, user=user)

    return _dependency
