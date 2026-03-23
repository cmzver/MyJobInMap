"""
Unified analytics API.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.reports import ReportsResponse, get_reports
from app.models import UserModel, UserRole, get_db
from app.services import get_current_dispatcher_or_admin
from app.services.analytics_periods import resolve_analytics_period
from app.services.excel_export import export_tasks_to_excel
from app.services.sla_service import get_sla_metrics
from app.services.tenant_filter import TenantFilter

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

PERIOD_PATTERN = "^(today|yesterday|week|month|quarter|year|all|custom)$"
PERIOD_LABELS = {
    "today": "Сегодня",
    "yesterday": "Вчера",
    "week": "Эта неделя",
    "month": "Этот месяц",
    "quarter": "Квартал",
    "year": "Год",
    "all": "Все время",
}


class AnalyticsResponse(BaseModel):
    reports: ReportsResponse
    sla: dict[str, Any]


async def _load_analytics_payload(
    *,
    period: str,
    date_from: Optional[date],
    date_to: Optional[date],
    worker_id: Optional[int],
    db: Session,
    user: UserModel,
) -> tuple[ReportsResponse, dict[str, Any]]:
    reports = await get_reports(
        period=period,
        date_from=date_from,
        date_to=date_to,
        worker_id=worker_id,
        db=db,
        user=user,
    )
    sla = get_sla_metrics(
        db=db,
        period=period,
        date_from=date_from.isoformat() if date_from else None,
        date_to=date_to.isoformat() if date_to else None,
        worker_id=worker_id,
        tenant_user=user,
    )
    return reports, sla


def _format_period_label(
    period: str, date_from: Optional[date], date_to: Optional[date]
) -> str:
    if period == "custom" and date_from and date_to:
        return f"{date_from.strftime('%d.%m.%Y')} - {date_to.strftime('%d.%m.%Y')}"
    return PERIOD_LABELS.get(period, "Период не указан")


def _require_export_format(requested: str, expected: str) -> None:
    if requested.lower() != expected:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported export format '{requested}'. Use '{expected}'.",
        )


def _get_worker_name(db: Session, user: UserModel, worker_id: Optional[int]) -> str:
    if worker_id is None:
        return "Все исполнители"

    tenant = TenantFilter(user)
    worker = (
        tenant.apply(db.query(UserModel), UserModel)
        .filter(
            UserModel.id == worker_id,
            UserModel.role.in_([UserRole.WORKER.value, UserRole.DISPATCHER.value]),
            UserModel.is_active == True,
        )
        .first()
    )

    if not worker:
        return f"ID {worker_id}"
    return worker.full_name or worker.username


async def _export_analytics_document(
    *,
    period: str,
    date_from: Optional[date],
    date_to: Optional[date],
    worker_id: Optional[int],
    db: Session,
    user: UserModel,
) -> StreamingResponse:
    reports, sla = await _load_analytics_payload(
        period=period,
        date_from=date_from,
        date_to=date_to,
        worker_id=worker_id,
        db=db,
        user=user,
    )

    start_date, end_date, _ = resolve_analytics_period(period, date_from, date_to)
    worker_name = _get_worker_name(db, user, worker_id)
    organization_name = (
        user.organization.name
        if getattr(user, "organization", None)
        else "Все организации"
    )
    generated_by = user.full_name or user.username

    output = export_tasks_to_excel(
        db=db,
        assignee_id=worker_id,
        date_from=start_date.isoformat() if start_date else None,
        date_to=end_date.isoformat() if end_date else None,
        tenant_user=user,
        document_title="Аналитический отчет по заявкам",
        period_label=_format_period_label(period, date_from, date_to),
        generated_by=generated_by,
        organization_name=organization_name,
        worker_name=worker_name,
        overview_metrics=reports.model_dump(),
        sla_metrics=sla,
    )

    filename = f"analytics_{period}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("", response_model=AnalyticsResponse)
async def get_analytics(
    period: str = Query(default="month", pattern=PERIOD_PATTERN),
    date_from: Optional[date] = Query(
        default=None, description="Custom period start (YYYY-MM-DD)"
    ),
    date_to: Optional[date] = Query(
        default=None, description="Custom period end (YYYY-MM-DD)"
    ),
    worker_id: Optional[int] = Query(default=None, description="Filter by worker ID"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin),
):
    reports, sla = await _load_analytics_payload(
        period=period,
        date_from=date_from,
        date_to=date_to,
        worker_id=worker_id,
        db=db,
        user=user,
    )
    return AnalyticsResponse(reports=reports, sla=sla)


@router.get("/export")
async def export_analytics(
    period: str = Query(default="month", pattern=PERIOD_PATTERN),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    worker_id: Optional[int] = Query(default=None),
    format: str = Query(default="xlsx", description="Unified export format: xlsx"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin),
):
    _require_export_format(format, "xlsx")
    return await _export_analytics_document(
        period=period,
        date_from=date_from,
        date_to=date_to,
        worker_id=worker_id,
        db=db,
        user=user,
    )


@router.get("/export/excel")
async def export_analytics_excel(
    period: str = Query(default="month", pattern=PERIOD_PATTERN),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    worker_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin),
):
    return await _export_analytics_document(
        period=period,
        date_from=date_from,
        date_to=date_to,
        worker_id=worker_id,
        db=db,
        user=user,
    )
