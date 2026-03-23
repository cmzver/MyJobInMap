"""
API v2 — Tasks endpoints
=========================
Расширенные эндпоинты заявок с envelope-форматом и метаданными.

v2 формат ответа:
{
  "data": { ... },
  "meta": { "api_version": "v2", "request_id": "...", "timestamp": "..." }
}
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.address_extended import build_task_filters_for_address
from app.config import settings
from app.models import TaskModel, TaskStatus, UserModel, UserRole, get_db
from app.models.address import AddressModel
from app.schemas import PaginatedResponse, TaskListResponse
from app.services import require_permission
from app.services.tenant_filter import TenantFilter
from app.utils import (get_priority_rank, normalize_priority_value,
                       priority_rank_expr, task_to_list_response)

router = APIRouter(prefix="/tasks", tags=["v2-Tasks"])
logger = logging.getLogger(__name__)


def envelope(
    data: Any, request: Request, extra_meta: Optional[Dict[str, Any]] = None
) -> dict:
    """Оборачивает ответ в v2 envelope формат."""
    meta = {
        "api_version": "v2",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request_id": getattr(request.state, "request_id", None),
    }
    if extra_meta:
        meta.update(extra_meta)
    return {"data": data, "meta": meta}


@router.get("/summary")
async def tasks_summary(
    request: Request,
    status: Optional[TaskStatus] = None,
    assignee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    """
    v2-only: Сводка по заявкам (количество по статусам, приоритетам).

    Возвращает агрегированную статистику без загрузки отдельных заявок.
    """
    tenant = TenantFilter(user)
    query = tenant.apply(db.query(TaskModel), TaskModel)

    if user.role == UserRole.WORKER.value:
        query = query.filter(TaskModel.assigned_user_id == user.id)
    elif assignee_id is not None:
        query = query.filter(TaskModel.assigned_user_id == assignee_id)

    if status:
        query = query.filter(TaskModel.status == status.value)

    # Count by status
    status_counts = dict(
        db.query(TaskModel.status, func.count(TaskModel.id))
        .filter(TaskModel.id.in_(query.with_entities(TaskModel.id)))
        .group_by(TaskModel.status)
        .all()
    )

    # Count by priority
    priority_counts = dict(
        db.query(TaskModel.priority, func.count(TaskModel.id))
        .filter(TaskModel.id.in_(query.with_entities(TaskModel.id)))
        .group_by(TaskModel.priority)
        .all()
    )

    total = query.count()
    unassigned = query.filter(TaskModel.assigned_user_id.is_(None)).count()

    now = datetime.now(timezone.utc)
    overdue = query.filter(
        TaskModel.planned_date < now,
        TaskModel.status.notin_([TaskStatus.DONE.value, TaskStatus.CANCELLED.value]),
    ).count()

    summary_data = {
        "total": total,
        "unassigned": unassigned,
        "overdue": overdue,
        "by_status": {
            "NEW": status_counts.get("NEW", 0),
            "IN_PROGRESS": status_counts.get("IN_PROGRESS", 0),
            "DONE": status_counts.get("DONE", 0),
            "CANCELLED": status_counts.get("CANCELLED", 0),
        },
        "by_priority": {
            "PLANNED": priority_counts.get("PLANNED", 0),
            "CURRENT": priority_counts.get("CURRENT", 0),
            "URGENT": priority_counts.get("URGENT", 0),
            "EMERGENCY": priority_counts.get("EMERGENCY", 0),
        },
    }

    return envelope(summary_data, request)
