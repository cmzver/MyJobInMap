"""
Organization Settings API
=========================
Реквизиты, настройки документов и нормативы сроков своей организации.

Админ организации работает со своей; суперадмин указывает organization_id.
Здесь же логотип для бланка акта и предпросмотр бланка в PDF.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.models import OrganizationModel, OrganizationSettingsModel, UserModel, get_db
from app.schemas.organization_settings import (
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
)
from app.services import require_permission
from app.services.act_pdf import render_act_document, sample_act_content
from app.services.act_service import requisites_snapshot
from app.services.business_time import business_tz
from app.services.organization_settings_service import (
    DEFAULT_ACT_NUMBER_PREFIX,
    LOGO_MAX_BYTES,
    OrganizationSettingsError,
    get_organization_settings,
    logo_path,
    remove_act_logo,
    save_act_logo,
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


@router.post("/act-preview")
def preview_act(
    data: OrganizationSettingsUpdate,
    organization_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_settings")),
):
    """Образец акта по введённым (ещё не сохранённым) реквизитам и бланку."""
    target = _target_organization(user, organization_id)
    organization = db.get(OrganizationModel, target)
    if organization is None:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    saved = db.get(OrganizationSettingsModel, target)
    draft = OrganizationSettingsModel(
        organization_id=target,
        **data.model_dump(exclude={"sla_hours", "act_template"}),
        act_template=data.act_template.model_dump(),
        act_logo_file=saved.act_logo_file if saved else None,
    )
    prefix = (data.act_number_prefix or "").strip() or DEFAULT_ACT_NUMBER_PREFIX
    number = f"{prefix}-{datetime.now(business_tz()).year}-000123"
    pdf = render_act_document(
        number,
        sample_act_content(number),
        requisites_snapshot(draft, organization.name),
        "0" * 64,
    )
    return Response(content=pdf, media_type="application/pdf")


@router.put("/logo", response_model=OrganizationSettingsResponse)
async def upload_logo(
    file: UploadFile = File(...),
    organization_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("edit_settings")),
):
    """Логотип для шапки акта: PNG или JPG до 2 МБ."""
    content = await file.read(LOGO_MAX_BYTES + 1)
    try:
        return save_act_logo(
            db, _target_organization(user, organization_id), content, user
        )
    except OrganizationSettingsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.delete("/logo", response_model=OrganizationSettingsResponse)
def delete_logo(
    organization_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("edit_settings")),
):
    try:
        return remove_act_logo(db, _target_organization(user, organization_id), user)
    except OrganizationSettingsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/logo")
def read_logo(
    organization_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_settings")),
):
    row = db.get(OrganizationSettingsModel, _target_organization(user, organization_id))
    path = logo_path(row.act_logo_file if row else None)
    if path is None:
        raise HTTPException(status_code=404, detail="Логотипа нет")
    return FileResponse(path, media_type="image/png")
