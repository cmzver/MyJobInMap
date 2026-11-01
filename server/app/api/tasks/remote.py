"""
Удалённое решение из карточки заявки
====================================
Панели домофона на адресе заявки, кадр с панели в фото заявки и «Решено
удалённо» — открыли дверь, выдали код ключей, без выезда. Сами действия с
панелью — в api/addresses/panel_actions.py (с ?task_id= они попадают в
историю заявки).
"""

from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.addresses.panel_actions import (
    _raise_device_error,
    get_panel_or_404,
    has_panel_access,
)
from app.api.deps import TaskAccess, require_task_access
from app.api.tasks.core import enforce_version
from app.models import IntercomPanelModel, TaskModel, get_db
from app.schemas import PhotoResponse
from app.schemas.address import TaskPanelResponse
from app.schemas.task import RemoteResolveRequest, TaskResponse
from app.services import beward
from app.services.idempotency import IdempotencyKey, cached_response, stage_response
from app.services.photo_service import (
    PhotoService,
    PhotoServiceError,
    get_photo_service,
)
from app.services.task_service import TaskServiceError, get_task_service
from app.services.websocket_manager import broadcast_task_status_changed
from app.utils import task_to_response

router = APIRouter(prefix="/api/tasks", tags=["Remote resolution"])


def _panel_of_task(
    task: TaskModel, panel_id: int, db: Session, user
) -> IntercomPanelModel:
    if task.address_id is None:
        raise HTTPException(status_code=404, detail="У заявки нет адреса с панелями")
    return get_panel_or_404(task.address_id, panel_id, db, user)


@router.get("/{task_id}/panels", response_model=List[TaskPanelResponse])
def get_task_panels(
    access: TaskAccess = Depends(
        require_task_access("view_tasks", worker_detail="Нет доступа к этой заявке")
    ),
    db: Session = Depends(get_db),
):
    """Включённые панели адреса заявки — если пользователь может ими управлять."""
    task = access.task
    if task.address_id is None or not has_panel_access(
        task.address_id, db, access.user
    ):
        return []
    panels = (
        db.query(IntercomPanelModel)
        .filter(
            IntercomPanelModel.address_id == task.address_id,
            IntercomPanelModel.is_active.is_(True),
        )
        .order_by(IntercomPanelModel.entrance, IntercomPanelModel.id)
        .all()
    )
    return [TaskPanelResponse.model_validate(panel) for panel in panels]


@router.post(
    "/{task_id}/panels/{panel_id}/snapshot-photo", response_model=PhotoResponse
)
async def save_panel_snapshot(
    panel_id: int,
    access: TaskAccess = Depends(
        require_task_access("add_photos", worker_detail="Нет доступа к этой заявке")
    ),
    db: Session = Depends(get_db),
    service: PhotoService = Depends(get_photo_service),
):
    """Кадр с камеры панели — в фото заявки («после»): доказательство, что
    вопрос решён удалённо."""
    panel = _panel_of_task(access.task, panel_id, db, access.user)
    try:
        image = await beward.get_snapshot(panel.ip, panel.port)
    except beward.BewardError as exc:
        _raise_device_error(exc)
    try:
        return await run_in_threadpool(
            service.upload,
            task=access.task,
            current_user=access.user,
            photo_type="after",
            filename=f"panel-{panel.id}.jpg",
            content=image,
        )
    except PhotoServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/{task_id}/resolve-remotely", response_model=TaskResponse)
def resolve_remotely(
    task_id: int,
    data: RemoteResolveRequest,
    background_tasks: BackgroundTasks,
    access: TaskAccess = Depends(
        require_task_access(
            "change_task_status", worker_detail="Нет доступа к этой заявке"
        )
    ),
    idempotency_key: IdempotencyKey = None,
    task_service=Depends(get_task_service),
):
    """Решено удалённо: назначить на себя, если никто не назначен, провести
    NEW → IN_PROGRESS → DONE с историей и отметить заявку удалённой — одной
    транзакцией. Повтор с тем же Idempotency-Key вернёт прежний ответ."""
    db = task_service.db
    db.refresh(access.task, with_for_update={"of": TaskModel})
    scope = f"resolve:{task_id}"
    cached = cached_response(db, access.user.id, idempotency_key, scope)
    if cached is not None:
        return cached

    enforce_version(access.task, data.expected_version)
    old_status = access.task.status
    try:
        task = task_service.resolve_remotely(
            task_id,
            data.comment,
            access.user,
            before_commit=lambda resolved: stage_response(
                db, access.user.id, idempotency_key, scope, task_to_response(resolved)
            ),
        )
    except TaskServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    background_tasks.add_task(
        broadcast_task_status_changed,
        task_id=task.id,
        task_number=task.task_number or "",
        old_status=old_status,
        new_status=task.status,
        user_id=access.user.id,
        organization_id=task.organization_id,
    )
    return task_to_response(task)
