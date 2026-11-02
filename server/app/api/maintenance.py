"""
Maintenance portfolio API
=========================
Массовые регламенты ТО, сетка «регламент × месяц» и отчёт выполнения (фаза 5c).
"""

from datetime import date
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.models import AddressModel, CounterpartyModel, UserModel, get_db
from app.schemas.counterparty import MONTH_PATTERN
from app.schemas.operations import (
    MaintenanceBulkCreate,
    MaintenanceBulkResult,
    ScheduleResponse,
)
from app.services import require_permission
from app.services.maintenance_schedule import (
    MAX_MONTHS,
    bulk_create,
    month_report,
    schedule,
)
from app.services.tenant_filter import TenantFilter

router = APIRouter(prefix="/api", tags=["Maintenance"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _organization_id(user: UserModel) -> int:
    if user.organization_id is None:
        raise HTTPException(400, "Регламенты ведутся внутри организации")
    return user.organization_id


@router.post("/maintenance-plans/bulk", response_model=MaintenanceBulkResult)
def create_bulk_maintenance(
    data: MaintenanceBulkCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    """Один регламент на много объектов — список или все объекты контрагента
    (договор с УК покрывает десятки домов)."""
    organization_id = _organization_id(user)
    query = db.query(AddressModel).filter(
        AddressModel.organization_id == organization_id
    )
    if data.counterparty_id is not None:
        counterparty = (
            db.query(CounterpartyModel)
            .filter(
                CounterpartyModel.id == data.counterparty_id,
                CounterpartyModel.organization_id == organization_id,
            )
            .first()
        )
        if counterparty is None:
            raise HTTPException(404, "Контрагент не найден")
        addresses = query.filter(AddressModel.counterparty_id == counterparty.id).all()
        if not addresses:
            raise HTTPException(422, "У контрагента нет объектов")
    else:
        wanted = set(data.address_ids)
        addresses = query.filter(AddressModel.id.in_(wanted)).all()
        if len(addresses) != len(wanted):
            raise HTTPException(404, "Объект не найден")
    if data.assigned_user_id:
        assigned = (
            TenantFilter(user)
            .apply(db.query(UserModel), UserModel)
            .filter(UserModel.id == data.assigned_user_id)
            .first()
        )
        if assigned is None or not assigned.is_active:
            raise HTTPException(422, "Исполнитель недоступен в этой организации")

    fields = data.model_dump(exclude={"address_ids", "counterparty_id"})
    fields["excluded_dates"] = [day.isoformat() for day in data.excluded_dates]
    created, skipped = bulk_create(db, user, fields, addresses)
    return MaintenanceBulkResult(created=created, skipped=skipped)


@router.get("/maintenance/schedule", response_model=ScheduleResponse)
def maintenance_schedule(
    month_from: str = Query(..., pattern=MONTH_PATTERN),
    months: int = Query(6, ge=1, le=MAX_MONTHS),
    counterparty_id: Optional[int] = Query(None),
    assigned_user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    """Сетка выполнения ТО: по каждому регламенту и месяцу — выполнено, в работе,
    просрочено, отменено (по созданным заявкам) и запланировано (прогноз)."""
    _organization_id(user)
    return schedule(
        db,
        user,
        date.fromisoformat(f"{month_from}-01"),
        months,
        counterparty_id,
        assigned_user_id,
    )


@router.get("/maintenance/report.xlsx")
def maintenance_report(
    month: str = Query(..., pattern=MONTH_PATTERN),
    counterparty_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("assign_tasks")),
):
    """Отчёт выполнения ТО за месяц: выезды и сводка по объектам — Excel."""
    _organization_id(user)
    return Response(
        content=month_report(db, user, month, counterparty_id),
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(f"ТО {month}.xlsx")
        },
    )
