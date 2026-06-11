"""
Admin Tasks API
===============
Админское обновление заявок (PATCH /api/admin/tasks/{id}). Логика — в
TaskService.admin_update_task; роутер тонкий.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.models import UserModel
from app.schemas import TaskResponse, TaskUpdate
from app.services import get_current_admin
from app.services.task_service import TaskService, TaskServiceError, get_task_service
from app.utils import task_to_response

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def admin_update_task(
    task_id: int,
    task_data: TaskUpdate,
    admin: UserModel = Depends(get_current_admin),
    service: TaskService = Depends(get_task_service),
):
    """Обновить заявку (админ)"""
    try:
        task = service.admin_update_task(task_id, task_data, admin)
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return task_to_response(task)
