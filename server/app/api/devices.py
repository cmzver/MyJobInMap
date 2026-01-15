"""
Devices API
===========
Эндпоинты для управления устройствами.
"""

from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.models import UserModel, DeviceModel, get_db
from app.schemas import DeviceRegister
from app.services import get_current_user, get_current_admin
from app.services.push import firebase_app


router = APIRouter(prefix="/api/devices", tags=["Devices"])


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
    devices = db.query(DeviceModel).order_by(DeviceModel.last_active.desc()).all()
    
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


@router.delete("/{device_id}")
async def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """Удалить устройство по ID (только админ)"""
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    db.delete(device)
    db.commit()
    
    return {"success": True}


@router.post("/register")


@router.post("/register")
async def register_device(
    device: DeviceRegister,
    db: Session = Depends(get_db),
    user: Optional[UserModel] = Depends(get_current_user)
):
    """Регистрация устройства"""
    print(f"📱 Device registration: token={device.token[:30]}... name={device.device_name}")
    
    existing = db.query(DeviceModel).filter(DeviceModel.fcm_token == device.token).first()
    
    if existing:
        existing.last_active = datetime.now(timezone.utc)
        if user:
            existing.user_id = user.id
        if device.device_name:
            existing.device_name = device.device_name
        db.commit()
        print(f"   ✅ Device updated: ID={existing.id}")
        return {"message": "Device updated", "device_id": existing.id}
    
    if not user:
        user = db.query(UserModel).filter(UserModel.username == "user").first()
        if not user:
            raise HTTPException(status_code=400, detail="Authentication required")
    
    new_device = DeviceModel(
        user_id=user.id,
        fcm_token=device.token,
        device_name=device.device_name
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    
    print(f"   ✅ New device registered: ID={new_device.id}")
    return {"message": "Device registered", "device_id": new_device.id}


@router.delete("/unregister")
async def unregister_device(
    device: DeviceRegister,
    db: Session = Depends(get_db)
):
    """Удаление устройства"""
    existing = db.query(DeviceModel).filter(DeviceModel.fcm_token == device.token).first()
    if existing:
        db.delete(existing)
        db.commit()
    return {"message": "Device unregistered"}


@router.get("")
async def list_devices_info(db: Session = Depends(get_db)):
    """Информация об устройствах"""
    count = db.query(DeviceModel).count()
    return {
        "count": count,
        "firebase_enabled": firebase_app is not None
    }
