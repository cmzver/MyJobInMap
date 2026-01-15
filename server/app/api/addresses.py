"""
API endpoints для управления базой адресов.
"""
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, distinct, func

from app.models import get_db, AddressModel
from app.schemas.address import (
    AddressCreate,
    AddressUpdate,
    AddressResponse,
    AddressListResponse,
    AddressSearchResponse,
    AddressParseRequest,
    AddressParseResponse,
    AddressComposeRequest,
    AddressComposeResponse,
)
from app.services.geocoding import geocoding_service
from app.services.address_parser import parse_address, compose_address
from app.services.auth import get_current_user
from app.models.user import UserModel

router = APIRouter(prefix="/api/addresses", tags=["Addresses"])


@router.post("/parse", response_model=AddressParseResponse)
async def parse_address_endpoint(
    data: AddressParseRequest,
    user: UserModel = Depends(get_current_user)
):
    """Парсит полный адрес на составные части (город, улица, дом, корпус, подъезд)"""
    parsed = parse_address(data.address)
    return AddressParseResponse(
        city=parsed.city,
        street=parsed.street,
        building=parsed.building,
        corpus=parsed.corpus,
        entrance=parsed.entrance
    )


@router.post("/compose", response_model=AddressComposeResponse)
async def compose_address_endpoint(
    data: AddressComposeRequest,
    user: UserModel = Depends(get_current_user)
):
    """Собирает полный адрес из составных частей"""
    address = compose_address(
        city=data.city or "",
        street=data.street or "",
        building=data.building or "",
        corpus=data.corpus or "",
        entrance=data.entrance or ""
    )
    return AddressComposeResponse(address=address)


@router.get("", response_model=AddressListResponse)
async def get_addresses(
    search: Optional[str] = Query(None, description="Поиск по адресу"),
    city: Optional[str] = Query(None, description="Фильтр по городу"),
    is_active: Optional[bool] = Query(None, description="Фильтр по активности"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    size: int = Query(50, ge=1, le=100, description="Размер страницы"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить список адресов с пагинацией и поиском"""
    query = db.query(AddressModel)
    
    # Фильтры
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                AddressModel.address.ilike(search_pattern),
                AddressModel.street.ilike(search_pattern),
                AddressModel.building.ilike(search_pattern),
            )
        )
    
    if city:
        query = query.filter(AddressModel.city.ilike(f"%{city}%"))
    
    if is_active is not None:
        query = query.filter(AddressModel.is_active == is_active)
    
    # Подсчёт
    total = query.count()
    
    # Пагинация
    addresses = query.order_by(AddressModel.address).offset((page - 1) * size).limit(size).all()
    
    return AddressListResponse(
        items=[AddressResponse.from_orm(a) for a in addresses],
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size if total > 0 else 1
    )


@router.get("/search", response_model=list[AddressSearchResponse])
async def search_addresses(
    q: str = Query(..., min_length=2, description="Поисковый запрос"),
    limit: int = Query(10, ge=1, le=50, description="Лимит результатов"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Быстрый поиск адресов для автокомплита"""
    search_pattern = f"%{q}%"
    
    addresses = db.query(AddressModel).filter(
        AddressModel.is_active == True,
        or_(
            AddressModel.address.ilike(search_pattern),
            AddressModel.street.ilike(search_pattern),
            AddressModel.building.ilike(search_pattern),
        )
    ).order_by(AddressModel.address).limit(limit).all()
    
    return [AddressSearchResponse.model_validate(a) for a in addresses]


@router.get("/find-by-components", response_model=Optional[AddressSearchResponse])
async def find_by_components(
    city: str = Query(..., description="Город"),
    street: str = Query(..., description="Улица"),
    building: str = Query(..., description="Дом"),
    corpus: Optional[str] = Query(None, description="Корпус"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Найти адрес по компонентам (город, улица, дом, корпус)"""
    query = db.query(AddressModel).filter(
        AddressModel.is_active == True,
        AddressModel.city == city,
        AddressModel.street == street,
        AddressModel.building == building,
    )
    
    if corpus and corpus != 'none':
        query = query.filter(AddressModel.corpus == corpus)
    else:
        # Если корпус не указан, ищем адрес без корпуса
        query = query.filter(
            (AddressModel.corpus.is_(None)) | (AddressModel.corpus == "")
        )
    
    address = query.first()
    
    if not address:
        return None
    
    return AddressSearchResponse.model_validate(address)


@router.get("/{address_id}", response_model=AddressResponse)
async def get_address(
    address_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить адрес по ID"""
    address = db.query(AddressModel).filter(AddressModel.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Адрес не найден")
    return AddressResponse.model_validate(address)


@router.post("", response_model=AddressResponse, status_code=201)
async def create_address(
    data: AddressCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Создать новый адрес"""
    # Проверка на дубликат
    existing = db.query(AddressModel).filter(
        AddressModel.address.ilike(data.address)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Адрес уже существует в базе")
    
    # Геокодирование если координаты не указаны
    lat, lon = data.lat, data.lon
    if lat is None or lon is None:
        lat, lon = geocoding_service.geocode(data.address)
    
    address = AddressModel(
        address=data.address,
        city=data.city or "",
        street=data.street or "",
        building=data.building or "",
        corpus=data.corpus or "",
        entrance=data.entrance or "",
        lat=lat,
        lon=lon,
        entrance_count=data.entrance_count or 1,
        floor_count=data.floor_count or 1,
        apartment_count=data.apartment_count,
        has_elevator=data.has_elevator or False,
        has_intercom=data.has_intercom or False,
        intercom_code=data.intercom_code or "",
        management_company=data.management_company or "",
        management_phone=data.management_phone or "",
        notes=data.notes or "",
        is_active=True,
    )
    
    db.add(address)
    db.commit()
    db.refresh(address)
    
    return AddressResponse.model_validate(address)


@router.put("/{address_id}", response_model=AddressResponse)
async def update_address(
    address_id: int,
    data: AddressUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Обновить адрес"""
    address = db.query(AddressModel).filter(AddressModel.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Адрес не найден")
    
    # Обновляем только переданные поля
    update_data = data.model_dump(exclude_unset=True)
    
    # Если меняется адрес, проверяем на дубликат
    if "address" in update_data and update_data["address"] != address.address:
        existing = db.query(AddressModel).filter(
            AddressModel.address.ilike(update_data["address"]),
            AddressModel.id != address_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Такой адрес уже существует")
        
        # Перегеокодируем при смене адреса
        lat, lon = geocoding_service.geocode(update_data["address"])
        update_data["lat"] = lat
        update_data["lon"] = lon
    
    for field, value in update_data.items():
        setattr(address, field, value)
    
    address.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(address)
    
    return AddressResponse.model_validate(address)


@router.delete("/{address_id}", status_code=204)
async def delete_address(
    address_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Удалить адрес"""
    address = db.query(AddressModel).filter(AddressModel.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Адрес не найден")
    
    db.delete(address)
    db.commit()
    
    return None


@router.post("/{address_id}/deactivate", response_model=AddressResponse)
async def deactivate_address(
    address_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Деактивировать адрес (мягкое удаление)"""
    address = db.query(AddressModel).filter(AddressModel.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Адрес не найден")
    
    address.is_active = False
    address.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(address)
    
    return AddressResponse.model_validate(address)


# ============================================
# Autocomplete endpoints
# ============================================

@router.get("/autocomplete/cities", response_model=List[str])
async def autocomplete_cities(
    q: str = Query("", description="Поисковый запрос"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить список уникальных городов для автоподставления"""
    all_cities = db.query(distinct(AddressModel.city)).filter(
        AddressModel.city.isnot(None),
        AddressModel.city != ""
    ).order_by(AddressModel.city).limit(limit * 5).all()  # Get more to filter in Python
    
    results = [r[0] for r in all_cities if r[0]]
    
    # Фильтрация на Python-уровне (поддерживает Unicode/Cyrillic)
    if q:
        q_lower = q.lower()
        results = [city for city in results if q_lower in city.lower()]
    
    return results[:limit]


@router.get("/autocomplete/streets", response_model=List[str])
async def autocomplete_streets(
    q: str = Query("", description="Поисковый запрос"),
    city: Optional[str] = Query(None, description="Фильтр по городу"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить список уникальных улиц для автоподставления"""
    # Сначала фильтруем по городу на уровне БД (точное совпадение)
    if city:
        all_streets = db.query(distinct(AddressModel.street)).filter(
            AddressModel.street.isnot(None),
            AddressModel.street != "",
            AddressModel.city == city  # Точное совпадение города
        ).order_by(AddressModel.street).limit(limit * 5).all()
    else:
        all_streets = db.query(distinct(AddressModel.street)).filter(
            AddressModel.street.isnot(None),
            AddressModel.street != ""
        ).order_by(AddressModel.street).limit(limit * 5).all()
    
    results = [r[0] for r in all_streets if r[0]]
    
    # Фильтрация на Python-уровне (поддерживает Unicode/Cyrillic)
    if q:
        q_lower = q.lower()
        results = [street for street in results if q_lower in street.lower()]
    
    return results[:limit]


@router.get("/autocomplete/buildings", response_model=List[str])
async def autocomplete_buildings(
    q: str = Query("", description="Поисковый запрос"),
    city: Optional[str] = Query(None, description="Фильтр по городу"),
    street: Optional[str] = Query(None, description="Фильтр по улице"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить список уникальных домов для автоподставления"""
    # Строим базовый query
    query = db.query(distinct(AddressModel.building)).filter(
        AddressModel.building.isnot(None),
        AddressModel.building != ""
    )
    
    # Фильтруем по городу и улице (точные совпадения)
    if city:
        query = query.filter(AddressModel.city == city)
    if street:
        query = query.filter(AddressModel.street == street)
    
    all_buildings = query.order_by(AddressModel.building).limit(limit * 5).all()
    results = [r[0] for r in all_buildings if r[0]]
    
    # Фильтрация на Python-уровне (поддерживает Unicode/Cyrillic)
    if q:
        q_lower = q.lower()
        results = [building for building in results if q_lower in building.lower()]
    
    return results[:limit]


@router.get("/autocomplete/full", response_model=List[AddressSearchResponse])
async def autocomplete_full_address(
    q: str = Query("", description="Поисковый запрос по полному адресу"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Поиск адресов по полному адресу для автоподставления в заявках"""
    query = db.query(AddressModel).filter(AddressModel.is_active == True)
    
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(
            or_(
                AddressModel.address.ilike(search_pattern),
                AddressModel.street.ilike(search_pattern),
                AddressModel.building.ilike(search_pattern),
            )
        )
    
    results = query.order_by(AddressModel.address).limit(limit).all()
    return [AddressSearchResponse.model_validate(a) for a in results]


@router.get("/autocomplete/corpus", response_model=List[str])
async def autocomplete_corpus(
    city: str = Query(..., description="Город"),
    street: str = Query(..., description="Улица"),
    building: str = Query(..., description="Дом"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить список уникальных корпусов для адреса"""
    results = db.query(distinct(AddressModel.corpus)).filter(
        AddressModel.corpus.isnot(None),
        AddressModel.corpus != "",
        AddressModel.city == city,  # Точное совпадение
        AddressModel.street == street,  # Точное совпадение
        AddressModel.building == building,  # Точное совпадение
    ).order_by(AddressModel.corpus).limit(limit).all()
    
    return [r[0] for r in results if r[0]]


@router.get("/autocomplete/entrance", response_model=List[str])
async def autocomplete_entrance(
    city: str = Query(..., description="Город"),
    street: str = Query(..., description="Улица"),
    building: str = Query(..., description="Дом"),
    corpus: Optional[str] = Query(None, description="Корпус"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user)
):
    """Получить список подъездов на основе entrance_count адреса"""
    query = db.query(AddressModel).filter(
        AddressModel.city == city,
        AddressModel.street == street,
        AddressModel.building == building,
    )
    
    if corpus and corpus != 'none':
        query = query.filter(AddressModel.corpus == corpus)
    else:
        # Если корпус не указан или 'none', ищем адрес без корпуса
        query = query.filter(
            (AddressModel.corpus.is_(None)) | (AddressModel.corpus == "")
        )
    
    address = query.first()
    
    if not address or not address.entrance_count or address.entrance_count < 1:
        return []
    
    # Генерируем список подъездов от 1 до entrance_count
    return [str(i) for i in range(1, min(address.entrance_count + 1, limit + 1))]

