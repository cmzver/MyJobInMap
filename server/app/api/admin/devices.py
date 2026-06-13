"""
Admin Devices API
=================
Просмотр и удаление зарегистрированных устройств (FCM) с учётом tenant-доступа.
Тонкие CRUD-контроллеры.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models import DeviceModel, UserModel, get_db
from app.schemas import DeviceResponse
from app.services import get_current_superadmin
from app.services.tenant_filter import TenantFilter

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/devices", response_model=List[DeviceResponse])
async def get_devices(
    db: Session = Depends(get_db), admin: UserModel = Depends(get_current_superadmin)
):
    """Получить список устройств"""
    tenant = TenantFilter(admin)
    devices_query = db.query(DeviceModel).join(
        UserModel, DeviceModel.user_id == UserModel.id
    )
    if not tenant.is_superadmin:
        devices_query = devices_query.filter(
            UserModel.organization_id == admin.organization_id
        )
    devices = devices_query.all()
    return [
        DeviceResponse(
            id=d.id,
            user_id=d.user_id,
            user_name=d.user.full_name if d.user else None,
            fcm_token=d.fcm_token,
            device_name=d.device_name,
            created_at=d.created_at,
            last_active=d.last_active,
        )
        for d in devices
    ]


@router.delete("/devices/{device_id}")
async def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Удалить устройство"""
    tenant = TenantFilter(admin)
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.user:
        tenant.enforce_access(device.user, detail="Device not found")

    db.delete(device)
    db.commit()
    return {"message": "Device deleted", "id": device_id}
