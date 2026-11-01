"""Настройки рабочего календаря SLA, изолированные по организации."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from app.models import OrganizationModel, UserModel, get_db
from app.models.sla_calendar import SlaCalendarModel
from app.services.auth import get_current_admin
from app.services.tenant_filter import TenantFilter

router = APIRouter(prefix="/api/sla-calendar", tags=["SLA calendar"])


class SlaCalendar(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    enabled: bool = False
    weekdays: list[int] = Field(
        default_factory=lambda: [0, 1, 2, 3, 4], min_length=1, max_length=7
    )
    start_time: str = Field("09:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field("18:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    excluded_dates: list[date] = Field(default_factory=list, max_length=366)

    @model_validator(mode="after")
    def validate_calendar(self):
        if any(day < 0 or day > 6 for day in self.weekdays):
            raise ValueError("Дни недели: от 0 до 6")
        if (
            len(set(self.weekdays)) != len(self.weekdays)
            or self.start_time >= self.end_time
        ):
            raise ValueError("Укажите разные дни недели и начало раньше окончания")
        return self


def organization(db, user, organization_id):
    org_id = organization_id if organization_id is not None else user.organization_id
    row = db.get(OrganizationModel, org_id) if org_id is not None else None
    if row is None:
        raise HTTPException(422, "Выберите организацию")
    # OrganizationModel.id — сам tenant, а organization_id у него отсутствует.
    tenant = TenantFilter(user)
    if not tenant.is_superadmin and user.organization_id != row.id:
        raise HTTPException(403, "Нет доступа к организации")
    return row.id


@router.get("", response_model=SlaCalendar)
def get_calendar(
    organization_id: int | None = None,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_admin),
):
    org_id = organization(db, user, organization_id)
    return db.get(SlaCalendarModel, org_id) or SlaCalendar()


@router.put("", response_model=SlaCalendar)
def save_calendar(
    data: SlaCalendar,
    organization_id: int | None = None,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_admin),
):
    org_id = organization(db, user, organization_id)
    row = db.get(SlaCalendarModel, org_id)
    if row is None:
        row = SlaCalendarModel(organization_id=org_id)
        db.add(row)
    for key, value in data.model_dump(mode="json").items():
        setattr(row, key, value)
    db.commit()
    return row
