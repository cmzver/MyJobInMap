from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel, get_db
from app.services import check_permission, enforce_worker_task_access, get_current_user_required


def get_task_or_404(
    task_id: int,
    db: Session = Depends(get_db)
) -> TaskModel:
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@dataclass(frozen=True)
class TaskAccess:
    task: TaskModel
    user: UserModel


def require_task_access(
    permission: str,
    detail: str = "Permission denied",
    worker_detail: str = "Access denied"
) -> Callable:
    async def _dependency(
        task: TaskModel = Depends(get_task_or_404),
        user: UserModel = Depends(get_current_user_required),
        db: Session = Depends(get_db)
    ) -> TaskAccess:
        if not check_permission(db, user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=detail
            )
        enforce_worker_task_access(user, task, detail=worker_detail)
        return TaskAccess(task=task, user=user)

    return _dependency
