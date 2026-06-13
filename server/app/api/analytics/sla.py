"""
SLA API
=======
Эндпоинты для мониторинга SLA (Service Level Agreement).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import get_db
from app.services import get_current_dispatcher_or_admin
from app.services.sla_service import get_sla_metrics

router = APIRouter(prefix="/api/sla", tags=["SLA"])


# ============================================================================
# Pydantic Models — отражают структуру get_sla_metrics() (единый источник
# истины для портальных типов через OpenAPI).
# ============================================================================


class SlaPeriodInfo(BaseModel):
    """Окно периода SLA-дашборда"""

    start: str
    end: str
    days: int
    label: str


class SlaOverview(BaseModel):
    """Общие метрики SLA"""

    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    new_tasks: int
    cancelled_tasks: int
    overdue_tasks: int
    active_overdue: int
    completion_rate: float
    sla_compliance_rate: float


class SlaTiming(BaseModel):
    """Статистика времени выполнения (часы)"""

    avg_completion_hours: float
    min_completion_hours: float
    max_completion_hours: float
    median_completion_hours: float


class SlaPriority(BaseModel):
    """SLA-метрики по приоритету"""

    priority: str
    label: str
    total: int
    completed: int
    sla_hours: int
    sla_compliance_rate: float


class SlaWorker(BaseModel):
    """SLA-метрики по исполнителю"""

    user_id: int
    user_name: str
    total_tasks: int
    completed_tasks: int
    completion_rate: float
    sla_compliance_rate: float
    avg_completion_hours: float


class SlaTrend(BaseModel):
    """Точка тренда по дню/неделе"""

    date: str
    created: int
    completed: int


class SlaResponse(BaseModel):
    """Полный ответ SLA-дашборда"""

    period: SlaPeriodInfo
    overview: SlaOverview
    timing: SlaTiming
    by_priority: List[SlaPriority]
    by_worker: List[SlaWorker]
    trends: List[SlaTrend]


@router.get("", response_model=SlaResponse)
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
