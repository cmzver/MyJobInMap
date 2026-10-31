"""
Organization Settings API
=========================
Реквизиты, настройки документов и нормативы сроков своей организации.

Админ организации работает со своей; суперадмин указывает organization_id.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.models import UserModel, get_db
from app.schemas.organization_settings import (
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
)
from app.services import require_permission
from app.services.organization_settings_service import (
    OrganizationSettingsError,
    get_organization_settings,
    update_organization_settings,
)

router = APIRouter(
    prefix="/api/admin/organization-settings", tags=["Organization Settings"]
)


def _target_organization(user: UserModel, organization_id: Optional[int]) -> int:
    if user.organization_id is not None:
        if organization_id not in (None, user.organization_id):
            raise HTTPException(status_code=403, detail="Нет доступа к организации")
        return user.organization_id
    if organization_id is None:
        raise HTTPException(status_code=400, detail="Укажите организацию")
    return organization_id


@router.get("", response_model=OrganizationSettingsResponse)
def read_organization_settings(
    organization_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_settings")),
):
    """Реквизиты, настройки актов и действующие нормативы сроков."""
    try:
        return get_organization_settings(
            db, _target_organization(user, organization_id)
        )
    except OrganizationSettingsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.put("", response_model=OrganizationSettingsResponse)
def save_organization_settings(
    data: OrganizationSettingsUpdate,
    organization_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("edit_settings")),
):
    """Сохранить настройки целиком; sla_hours=null — нормативы по умолчанию."""
    try:
        return update_organization_settings(
            db, _target_organization(user, organization_id), data, user
        )
    except OrganizationSettingsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
