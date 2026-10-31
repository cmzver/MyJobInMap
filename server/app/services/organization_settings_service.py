"""
Organization Settings Service
=============================
Реквизиты, настройки документов и нормативы сроков организации.

Строка в organization_settings создаётся при первом сохранении; до этого
действуют значения по умолчанию.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app.models import OrganizationModel, OrganizationSettingsModel, UserModel
from app.schemas.organization_settings import (
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
    SlaHours,
)
from app.services.sla_service import get_sla_hours_map

DEFAULT_ACT_NUMBER_PREFIX = "А"

# Поля реквизитов и документов — всё, кроме нормативов.
_PLAIN_FIELDS = tuple(
    name for name in OrganizationSettingsUpdate.model_fields if name != "sla_hours"
)


class OrganizationSettingsError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _ensure_organization(db: Session, organization_id: int) -> None:
    if db.get(OrganizationModel, organization_id) is None:
        raise OrganizationSettingsError("Организация не найдена", 404)


def get_organization_settings(
    db: Session, organization_id: int
) -> OrganizationSettingsResponse:
    _ensure_organization(db, organization_id)
    row = db.get(OrganizationSettingsModel, organization_id)
    values = {name: getattr(row, name) for name in _PLAIN_FIELDS} if row else {}
    hours = get_sla_hours_map(db, organization_id)
    return OrganizationSettingsResponse(
        organization_id=organization_id,
        **values,
        sla_hours=SlaHours(**{p: hours[p] for p in SlaHours.model_fields}),
        sla_hours_customized=bool(row and row.sla_hours),
    )


def update_organization_settings(
    db: Session,
    organization_id: int,
    data: OrganizationSettingsUpdate,
    user: Optional[UserModel] = None,
) -> OrganizationSettingsResponse:
    """Сохранить настройки целиком. Сроки открытых заявок не пересчитываются:
    новые нормативы действуют для новых заявок и при следующей правке."""
    _ensure_organization(db, organization_id)
    row = db.get(OrganizationSettingsModel, organization_id)
    if row is None:
        row = OrganizationSettingsModel(organization_id=organization_id)
        db.add(row)
    for name in _PLAIN_FIELDS:
        value = getattr(data, name)
        setattr(row, name, (value.strip() or None) if isinstance(value, str) else value)
    row.act_number_prefix = row.act_number_prefix or DEFAULT_ACT_NUMBER_PREFIX
    row.sla_hours = data.sla_hours.model_dump() if data.sla_hours else None
    row.updated_by_id = user.id if user else None
    db.commit()
    return get_organization_settings(db, organization_id)
