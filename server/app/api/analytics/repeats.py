"""
Repeats API
===========
Повторные заявки: доля возвратов по мастерам, места с наибольшим числом заявок.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import get_db
from app.services import get_current_dispatcher_or_admin
from app.services.repeat_metrics import get_repeat_metrics

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


class RepeatPeriodInfo(BaseModel):
    start: str
    end: str
    days: int
    label: str


class RepeatOverview(BaseModel):
    created: int
    duplicates: int
    returns: int
    completed: int
    # Из закрытых за период — по скольким уже была заявка-возврат
    returned: int
    return_rate: float


class RepeatWorker(BaseModel):
    user_id: int
    user_name: str
    completed: int
    returned: int
    return_rate: float


class RepeatPlace(BaseModel):
    label: str
    address_id: Optional[int] = None
    tasks: int
    returns: int


class RepeatSystem(BaseModel):
    system_id: int
    name: str
    address_id: Optional[int] = None
    address: str
    tasks: int
    returns: int


class RepeatMetricsResponse(BaseModel):
    period: RepeatPeriodInfo
    window_days: int
    overview: RepeatOverview
    by_worker: List[RepeatWorker]
    top_addresses: List[RepeatPlace]
    top_systems: List[RepeatSystem]


@router.get("/repeats", response_model=RepeatMetricsResponse)
def repeat_metrics(
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
    db: Session = Depends(get_db),
    user=Depends(get_current_dispatcher_or_admin),
):
    """Повторы за период. Доступ: admin, dispatcher."""
    return get_repeat_metrics(
        db, user, period=period, date_from=date_from, date_to=date_to
    )
