"""
Admin Custom Fields API
=======================
CRUD кастомных полей заявок. Тонкие контроллеры.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models import CustomFieldModel, UserModel, get_db
from app.schemas import (
    CustomFieldCreate,
    CustomFieldResponse,
    CustomFieldUpdate,
)
from app.services import get_current_dispatcher_or_admin, get_current_superadmin

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/custom-fields", response_model=List[CustomFieldResponse])
async def get_custom_fields(
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin),
):
    """Получить список кастомных полей"""
    return db.query(CustomFieldModel).order_by(CustomFieldModel.id).all()


@router.post("/custom-fields", response_model=CustomFieldResponse)
async def create_custom_field(
    field_data: CustomFieldCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Создать кастомное поле"""
    existing = (
        db.query(CustomFieldModel)
        .filter(CustomFieldModel.name == field_data.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Field name already exists")

    field = CustomFieldModel(**field_data.model_dump())
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.patch("/custom-fields/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    field_id: int,
    field_data: CustomFieldUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Обновить кастомное поле"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    for key, value in field_data.model_dump(exclude_unset=True).items():
        setattr(field, key, value)

    db.commit()
    db.refresh(field)
    return field


@router.delete("/custom-fields/{field_id}")
async def delete_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Удалить кастомное поле"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    db.delete(field)
    db.commit()
    return {"message": "Field deleted"}


@router.patch("/custom-fields/{field_id}/toggle")
async def toggle_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Переключить активность поля"""
    field = db.query(CustomFieldModel).filter(CustomFieldModel.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    field.is_active = not field.is_active
    db.commit()
    return {"message": "Field status toggled", "is_active": field.is_active}
