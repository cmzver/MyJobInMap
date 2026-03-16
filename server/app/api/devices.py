"""
Devices API
===========
Эндпоинты для управления устройствами.
"""

from datetime import datetime, timezone
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.models import UserModel, DeviceModel, get_db
from app.schemas import DeviceRegister
from app.services import get_current_admin, get_current_user_required
from app.services.push import firebase_app
from app.services.tenant_filter import TenantFilter


router = APIRouter(prefix="/api/devices", tags=["Devices"])

logger = logging.getLogger(__name__)


class DeviceResponse(BaseModel):
    """Ответ с данными устройства"""
    id: int
    user_id: int
    user_name: Optional[str] = None
    device_name: Optional[str] = None
    fcm_token: str
    last_active: str
    
    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[DeviceResponse])
async def list_devices(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Получить список всех устройств (только админ)"""
    tenant = TenantFilter(admin)
    query = db.query(DeviceModel).join(UserModel, DeviceModel.user_id == UserModel.id)
    if not tenant.is_superadmin:
        query = query.filter(UserModel.organization_id == admin.organization_id)
    devices = query.order_by(DeviceModel.last_active.desc()).all()
    
    result = []
    for device in devices:
        user = db.query(UserModel).filter(UserModel.id == device.user_id).first()
        result.append(DeviceResponse(
            id=device.id,
            user_id=device.user_id,
            user_name=user.full_name or user.username if user else None,
            device_name=device.device_name,
            fcm_token=device.fcm_token,
            last_active=device.last_active.isoformat() if device.last_active else ""
        ))
    
    return result


@router.delete("/{device_id:int}")
async def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить устройство по ID (только админ)"""
    tenant = TenantFilter(admin)
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.user:
        tenant.enforce_access(device.user, detail="Device not found")
    
    db.delete(device)
    db.commit()
    
    return {"success": True}


@router.post("")
async def register_device(
    device: DeviceRegister,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required)
):
    """Регистрация устройства"""
    logger.info("Device registration: token=%s... name=%s", device.token[:30], device.device_name)
    
    existing = db.query(DeviceModel).filter(DeviceModel.fcm_token == device.token).first()
    
    if existing:
        existing.last_active = datetime.now(timezone.utc)
        existing.user_id = user.id
        if device.device_name:
            existing.device_name = device.device_name
        db.commit()
        logger.info("Device updated: ID=%d", existing.id)
        return {"message": "Device updated", "device_id": existing.id}
    
    new_device = DeviceModel(
        user_id=user.id,
        fcm_token=device.token,
        device_name=device.device_name
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    
    logger.info("New device registered: ID=%d", new_device.id)
    return {"message": "Device registered", "device_id": new_device.id}


@router.delete("/unregister")
async def unregister_device(
    device: DeviceRegister,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user_required)
):
    """Удаление устройства"""
    existing = db.query(DeviceModel).filter(
        DeviceModel.fcm_token == device.token,
        DeviceModel.user_id == current_user.id,
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
    return {"message": "Device unregistered"}


@router.get("/info")
async def list_devices_info(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Информация об устройствах"""
    count = db.query(DeviceModel).count()
    return {
        "count": count,
        "firebase_enabled": firebase_app is not None
    }
