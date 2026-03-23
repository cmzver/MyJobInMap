"""
SLA API
=======
Эндпоинты для мониторинга SLA (Service Level Agreement).
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.models import get_db
from app.services import get_current_dispatcher_or_admin
from app.services.sla_service import get_sla_metrics

router = APIRouter(prefix="/api/sla", tags=["SLA"])


@router.get("")
async def sla_dashboard(
    period: str = Query(
        default="month",
        pattern="^(today|yesterday|week|month|quarter|year|all|custom)$",
    ),
    date_from: Optional[str] = Query(
        default=None, description="ISO date for custom period"
    ),
    date_to: Optional[str] = Query(
        default=None, description="ISO date for custom period"
    ),
    worker_id: Optional[int] = Query(default=None, description="Filter by worker ID"),
    db: Session = Depends(get_db),
    user=Depends(get_current_dispatcher_or_admin),
):
    """
    SLA дашборд — метрики выполнения SLA.

    Доступ: admin, dispatcher

    Returns:
        overview: Общие метрики (total, completed, overdue, compliance rate)
        timing: Статистика времени выполнения
        by_priority: Метрики по приоритетам
        by_worker: Метрики по исполнителям
        trends: Тренды по дням/неделям
    """
    return get_sla_metrics(
        db=db,
        period=period,
        date_from=date_from,
        date_to=date_to,
        worker_id=worker_id,
        tenant_user=user,
    )
