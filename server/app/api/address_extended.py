"""
API endpoints для расширенной карточки объекта.

Управление системами, оборудованием, документами, контактами.
"""
import os
import uuid
import gzip
import shutil
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer, cast

from app.models import (
    get_db, 
    AddressModel,
    AddressSystemModel,
    AddressEquipmentModel,
    AddressDocumentModel,
    AddressContactModel,
    AddressHistoryModel,
    AddressHistoryEventType,
    TaskModel,
    TaskStatus,
)
from app.schemas.address import (
    AddressSystemCreate,
    AddressSystemUpdate,
    AddressSystemResponse,
    AddressEquipmentCreate,
    AddressEquipmentUpdate,
    AddressEquipmentResponse,
    AddressDocumentCreate,
    AddressDocumentUpdate,
    AddressDocumentResponse,
    AddressContactCreate,
    AddressContactUpdate,
    AddressContactResponse,
    AddressHistoryResponse,
    AddressFullResponse,
    TaskStats,
)
from app.services.auth import get_current_user
from app.models.user import UserModel
from app.config import settings

router = APIRouter(prefix="/api/addresses", tags=["Address Extended"])

# Директория для документов
DOCUMENTS_DIR = os.path.join(settings.BASE_DIR, "uploads", "address_documents")
os.makedirs(DOCUMENTS_DIR, exist_ok=True)


def get_address_or_404(address_id: int, db: Session) -> AddressModel:
    """Получить адрес или 404"""
    address = db.query(AddressModel).filter(AddressModel.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Адрес не найден")
    return address


def add_history_event(
    db: Session, 
    address_id: int, 
    event_type: AddressHistoryEventType, 
    description: str,
    user_id: Optional[int] = None
):
    """Добавить запись в историю объекта"""
    history = AddressHistoryModel(
        address_id=address_id,
        event_type=event_type.value,
        description=description,
        user_id=user_id
    )
    db.add(history)


# ============================================
# Full Address Card
# ============================================

@router.get("/{address_id}/full", response_model=AddressFullResponse)
async def get_address_full(
    address_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить полную карточку объекта со всеми связанными данными"""
    address = get_address_or_404(address_id, db)
    
    # Получаем статистику заявок по этому адресу
    task_stats_query = db.query(
        func.count(TaskModel.id).label('total'),
        func.sum(cast(TaskModel.status == TaskStatus.NEW.value, Integer)).label('new'),
        func.sum(cast(TaskModel.status == TaskStatus.IN_PROGRESS.value, Integer)).label('in_progress'),
        func.sum(cast(TaskModel.status == TaskStatus.DONE.value, Integer)).label('done'),
        func.sum(cast(TaskModel.status == TaskStatus.CANCELLED.value, Integer)).label('cancelled'),
    ).filter(
        TaskModel.raw_address.ilike(f"%{address.address}%")
    ).first()
    
    task_stats = TaskStats(
        total=task_stats_query.total or 0,
        new=task_stats_query.new or 0,
        in_progress=task_stats_query.in_progress or 0,
        done=task_stats_query.done or 0,
        cancelled=task_stats_query.cancelled or 0,
    )
    
    # Формируем ответ с документами (добавляем имя создателя)
    documents = []
    for doc in address.documents:
        doc_dict = {
            "id": doc.id,
            "address_id": doc.address_id,
            "name": doc.name,
            "doc_type": doc.doc_type,
            "file_path": doc.file_path,
            "file_size": doc.file_size,
            "mime_type": doc.mime_type,
            "valid_from": doc.valid_from,
            "valid_until": doc.valid_until,
            "notes": doc.notes,
            "created_at": doc.created_at,
            "created_by_id": doc.created_by_id,
            "created_by_name": doc.created_by.full_name if doc.created_by else None,
        }
        documents.append(AddressDocumentResponse(**doc_dict))
    
    return AddressFullResponse(
        id=address.id,
        address=address.address,
        city=address.city,
        street=address.street,
        building=address.building,
        corpus=address.corpus,
        entrance=address.entrance,
        lat=address.lat,
        lon=address.lon,
        entrance_count=address.entrance_count,
        floor_count=address.floor_count,
        apartment_count=address.apartment_count,
        has_elevator=address.has_elevator,
        has_intercom=address.has_intercom,
        intercom_code=address.intercom_code,
        management_company=address.management_company,
        management_phone=address.management_phone,
        notes=address.notes,
        extra_info=address.extra_info,
        is_active=address.is_active,
        created_at=address.created_at,
        updated_at=address.updated_at,
        systems=[AddressSystemResponse.model_validate(s) for s in address.systems],
        equipment=[AddressEquipmentResponse.model_validate(e) for e in address.equipment],
        documents=documents,
        contacts=[AddressContactResponse.model_validate(c) for c in address.contacts],
        task_stats=task_stats,
    )


# ============================================
# Systems CRUD
# ============================================

@router.get("/{address_id}/systems", response_model=list[AddressSystemResponse])
async def get_address_systems(
    address_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить системы объекта"""
    get_address_or_404(address_id, db)
    systems = db.query(AddressSystemModel).filter(
        AddressSystemModel.address_id == address_id
    ).order_by(AddressSystemModel.name).all()
    return [AddressSystemResponse.model_validate(s) for s in systems]


@router.post("/{address_id}/systems", response_model=AddressSystemResponse, status_code=201)
async def create_address_system(
    address_id: int,
    data: AddressSystemCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Добавить систему на объект"""
    get_address_or_404(address_id, db)
    
    system = AddressSystemModel(
        address_id=address_id,
        **data.model_dump()
    )
    db.add(system)
    
    add_history_event(
        db, address_id, 
        AddressHistoryEventType.SYSTEM_ADDED,
        f"Добавлена система: {data.name}",
        user.id
    )
    
    db.commit()
    db.refresh(system)
    return AddressSystemResponse.model_validate(system)


@router.put("/{address_id}/systems/{system_id}", response_model=AddressSystemResponse)
async def update_address_system(
    address_id: int,
    system_id: int,
    data: AddressSystemUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Обновить систему"""
    system = db.query(AddressSystemModel).filter(
        AddressSystemModel.id == system_id,
        AddressSystemModel.address_id == address_id
    ).first()
    
    if not system:
        raise HTTPException(status_code=404, detail="Система не найдена")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(system, key, value)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.SYSTEM_UPDATED,
        f"Обновлена система: {system.name}",
        user.id
    )
    
    db.commit()
    db.refresh(system)
    return AddressSystemResponse.model_validate(system)


@router.delete("/{address_id}/systems/{system_id}", status_code=204)
async def delete_address_system(
    address_id: int,
    system_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Удалить систему"""
    system = db.query(AddressSystemModel).filter(
        AddressSystemModel.id == system_id,
        AddressSystemModel.address_id == address_id
    ).first()
    
    if not system:
        raise HTTPException(status_code=404, detail="Система не найдена")
    
    system_name = system.name
    db.delete(system)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.SYSTEM_UPDATED,
        f"Удалена система: {system_name}",
        user.id
    )
    
    db.commit()


# ============================================
# Equipment CRUD
# ============================================

@router.get("/{address_id}/equipment", response_model=list[AddressEquipmentResponse])
async def get_address_equipment(
    address_id: int,
    system_id: Optional[int] = Query(None, description="Фильтр по системе"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить оборудование объекта"""
    get_address_or_404(address_id, db)
    
    query = db.query(AddressEquipmentModel).filter(
        AddressEquipmentModel.address_id == address_id
    )
    
    if system_id is not None:
        query = query.filter(AddressEquipmentModel.system_id == system_id)
    
    equipment = query.order_by(AddressEquipmentModel.name).all()
    return [AddressEquipmentResponse.model_validate(e) for e in equipment]


@router.post("/{address_id}/equipment", response_model=AddressEquipmentResponse, status_code=201)
async def create_address_equipment(
    address_id: int,
    data: AddressEquipmentCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Добавить оборудование на объект"""
    get_address_or_404(address_id, db)
    
    # Проверяем существование системы если указана
    if data.system_id:
        system = db.query(AddressSystemModel).filter(
            AddressSystemModel.id == data.system_id,
            AddressSystemModel.address_id == address_id
        ).first()
        if not system:
            raise HTTPException(status_code=400, detail="Система не найдена на этом объекте")
    
    equipment = AddressEquipmentModel(
        address_id=address_id,
        **data.model_dump()
    )
    db.add(equipment)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.EQUIPMENT_ADDED,
        f"Добавлено оборудование: {data.name} (кол-во: {data.quantity})",
        user.id
    )
    
    db.commit()
    db.refresh(equipment)
    return AddressEquipmentResponse.model_validate(equipment)


@router.put("/{address_id}/equipment/{equipment_id}", response_model=AddressEquipmentResponse)
async def update_address_equipment(
    address_id: int,
    equipment_id: int,
    data: AddressEquipmentUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Обновить оборудование"""
    equipment = db.query(AddressEquipmentModel).filter(
        AddressEquipmentModel.id == equipment_id,
        AddressEquipmentModel.address_id == address_id
    ).first()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(equipment, key, value)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.EQUIPMENT_UPDATED,
        f"Обновлено оборудование: {equipment.name}",
        user.id
    )
    
    db.commit()
    db.refresh(equipment)
    return AddressEquipmentResponse.model_validate(equipment)


@router.delete("/{address_id}/equipment/{equipment_id}", status_code=204)
async def delete_address_equipment(
    address_id: int,
    equipment_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Удалить оборудование"""
    equipment = db.query(AddressEquipmentModel).filter(
        AddressEquipmentModel.id == equipment_id,
        AddressEquipmentModel.address_id == address_id
    ).first()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    
    equipment_name = equipment.name
    db.delete(equipment)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.EQUIPMENT_UPDATED,
        f"Удалено оборудование: {equipment_name}",
        user.id
    )
    
    db.commit()


# ============================================
# Documents CRUD
# ============================================

@router.get("/{address_id}/documents", response_model=list[AddressDocumentResponse])
async def get_address_documents(
    address_id: int,
    doc_type: Optional[str] = Query(None, description="Фильтр по типу"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить документы объекта"""
    get_address_or_404(address_id, db)
    
    query = db.query(AddressDocumentModel).filter(
        AddressDocumentModel.address_id == address_id
    )
    
    if doc_type:
        query = query.filter(AddressDocumentModel.doc_type == doc_type)
    
    documents = query.order_by(AddressDocumentModel.created_at.desc()).all()
    
    result = []
    for doc in documents:
        result.append(AddressDocumentResponse(
            id=doc.id,
            address_id=doc.address_id,
            name=doc.name,
            doc_type=doc.doc_type,
            file_path=doc.file_path,
            file_size=doc.file_size,
            mime_type=doc.mime_type,
            valid_from=doc.valid_from,
            valid_until=doc.valid_until,
            notes=doc.notes,
            created_at=doc.created_at,
            created_by_id=doc.created_by_id,
            created_by_name=doc.created_by.full_name if doc.created_by else None,
        ))
    
    return result


@router.post("/{address_id}/documents", response_model=AddressDocumentResponse, status_code=201)
async def upload_address_document(
    address_id: int,
    file: UploadFile = File(...),
    name: str = Form(...),
    doc_type: str = Form(default="other"),
    valid_from: Optional[str] = Form(default=None),
    valid_until: Optional[str] = Form(default=None),
    notes: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Загрузить документ на объект"""
    get_address_or_404(address_id, db)
    
    # Создаём директорию для адреса
    address_dir = os.path.join(DOCUMENTS_DIR, str(address_id))
    os.makedirs(address_dir, exist_ok=True)
    
    # Генерируем уникальное имя файла
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(address_dir, unique_filename)
    
    # Сохраняем файл
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Парсим даты
    parsed_valid_from = None
    parsed_valid_until = None
    if valid_from:
        try:
            parsed_valid_from = datetime.fromisoformat(valid_from.replace("Z", "+00:00"))
        except ValueError:
            pass
    if valid_until:
        try:
            parsed_valid_until = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
        except ValueError:
            pass
    
    # Создаём запись в БД
    document = AddressDocumentModel(
        address_id=address_id,
        name=name,
        doc_type=doc_type,
        file_path=f"/uploads/address_documents/{address_id}/{unique_filename}",
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
        valid_from=parsed_valid_from,
        valid_until=parsed_valid_until,
        notes=notes,
        created_by_id=user.id,
    )
    db.add(document)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.DOCUMENT_ADDED,
        f"Добавлен документ: {name}",
        user.id
    )
    
    db.commit()
    db.refresh(document)
    
    return AddressDocumentResponse(
        id=document.id,
        address_id=document.address_id,
        name=document.name,
        doc_type=document.doc_type,
        file_path=document.file_path,
        file_size=document.file_size,
        mime_type=document.mime_type,
        valid_from=document.valid_from,
        valid_until=document.valid_until,
        notes=document.notes,
        created_at=document.created_at,
        created_by_id=document.created_by_id,
        created_by_name=user.full_name,
    )


@router.get("/{address_id}/documents/{document_id}/download")
async def download_address_document(
    address_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Скачать документ"""
    document = db.query(AddressDocumentModel).filter(
        AddressDocumentModel.id == document_id,
        AddressDocumentModel.address_id == address_id
    ).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Документ не найден")
    
    # Формируем путь к файлу
    file_path = os.path.join(settings.BASE_DIR, document.file_path.lstrip("/"))
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    return FileResponse(
        file_path,
        filename=document.name,
        media_type=document.mime_type
    )


@router.delete("/{address_id}/documents/{document_id}", status_code=204)
async def delete_address_document(
    address_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Удалить документ"""
    document = db.query(AddressDocumentModel).filter(
        AddressDocumentModel.id == document_id,
        AddressDocumentModel.address_id == address_id
    ).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Документ не найден")
    
    # Удаляем файл
    file_path = os.path.join(settings.BASE_DIR, document.file_path.lstrip("/"))
    if os.path.exists(file_path):
        os.remove(file_path)
    
    document_name = document.name
    db.delete(document)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.DOCUMENT_REMOVED,
        f"Удалён документ: {document_name}",
        user.id
    )
    
    db.commit()


# ============================================
# Contacts CRUD
# ============================================

@router.get("/{address_id}/contacts", response_model=list[AddressContactResponse])
async def get_address_contacts(
    address_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить контакты объекта"""
    get_address_or_404(address_id, db)
    contacts = db.query(AddressContactModel).filter(
        AddressContactModel.address_id == address_id
    ).order_by(AddressContactModel.is_primary.desc(), AddressContactModel.name).all()
    return [AddressContactResponse.model_validate(c) for c in contacts]


@router.post("/{address_id}/contacts", response_model=AddressContactResponse, status_code=201)
async def create_address_contact(
    address_id: int,
    data: AddressContactCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Добавить контакт на объект"""
    get_address_or_404(address_id, db)
    
    # Если новый контакт основной, сбрасываем флаг у других
    if data.is_primary:
        db.query(AddressContactModel).filter(
            AddressContactModel.address_id == address_id,
            AddressContactModel.is_primary == True
        ).update({"is_primary": False})
    
    contact = AddressContactModel(
        address_id=address_id,
        **data.model_dump()
    )
    db.add(contact)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.CONTACT_ADDED,
        f"Добавлен контакт: {data.name}",
        user.id
    )
    
    db.commit()
    db.refresh(contact)
    return AddressContactResponse.model_validate(contact)


@router.put("/{address_id}/contacts/{contact_id}", response_model=AddressContactResponse)
async def update_address_contact(
    address_id: int,
    contact_id: int,
    data: AddressContactUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Обновить контакт"""
    contact = db.query(AddressContactModel).filter(
        AddressContactModel.id == contact_id,
        AddressContactModel.address_id == address_id
    ).first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    
    # Если делаем контакт основным, сбрасываем у других
    if data.is_primary:
        db.query(AddressContactModel).filter(
            AddressContactModel.address_id == address_id,
            AddressContactModel.id != contact_id,
            AddressContactModel.is_primary == True
        ).update({"is_primary": False})
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(contact, key, value)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.CONTACT_UPDATED,
        f"Обновлён контакт: {contact.name}",
        user.id
    )
    
    db.commit()
    db.refresh(contact)
    return AddressContactResponse.model_validate(contact)


@router.delete("/{address_id}/contacts/{contact_id}", status_code=204)
async def delete_address_contact(
    address_id: int,
    contact_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Удалить контакт"""
    contact = db.query(AddressContactModel).filter(
        AddressContactModel.id == contact_id,
        AddressContactModel.address_id == address_id
    ).first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    
    contact_name = contact.name
    db.delete(contact)
    
    add_history_event(
        db, address_id,
        AddressHistoryEventType.CONTACT_UPDATED,
        f"Удалён контакт: {contact_name}",
        user.id
    )
    
    db.commit()


# ============================================
# History
# ============================================

@router.get("/{address_id}/history", response_model=list[AddressHistoryResponse])
async def get_address_history(
    address_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить историю объекта"""
    get_address_or_404(address_id, db)
    
    history = db.query(AddressHistoryModel).filter(
        AddressHistoryModel.address_id == address_id
    ).order_by(AddressHistoryModel.created_at.desc()).limit(limit).all()
    
    result = []
    for h in history:
        result.append(AddressHistoryResponse(
            id=h.id,
            address_id=h.address_id,
            event_type=h.event_type,
            description=h.description,
            user_id=h.user_id,
            user_name=h.user.full_name if h.user else None,
            created_at=h.created_at,
        ))
    
    return result


# ============================================
# Tasks by Address
# ============================================

@router.get("/{address_id}/tasks")
async def get_address_tasks(
    address_id: int,
    status: Optional[str] = Query(None, description="Фильтр по статусу"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить заявки по адресу"""
    address = get_address_or_404(address_id, db)
    
    query = db.query(TaskModel).filter(
        TaskModel.raw_address.ilike(f"%{address.address}%")
    )
    
    if status:
        query = query.filter(TaskModel.status == status)
    
    tasks = query.order_by(TaskModel.created_at.desc()).limit(limit).all()
    
    return [{
        "id": t.id,
        "task_number": t.task_number,
        "title": t.title,
        "status": t.status,
        "priority": t.priority,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "assigned_user": t.assigned_user.full_name if t.assigned_user else None,
    } for t in tasks]
