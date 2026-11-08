"""
API endpoints для управления базой адресов.
"""

import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct, func, or_
from sqlalchemy.orm import Session

from app.models import AddressAssigneeModel, AddressModel, CounterpartyModel, get_db
from app.models.task import TaskModel
from app.models.user import UserModel
from app.schemas.address import (
    AddressComposeRequest,
    AddressComposeResponse,
    AddressCreate,
    AddressListResponse,
    AddressParseRequest,
    AddressParseResponse,
    AddressResponse,
    AddressSearchResponse,
    AddressSuggestion,
    AddressUpdate,
)
from app.services import address_suggest
from app.services.address_parser import (
    ParsedAddress,
    building_key,
    compose_address,
    parse_address,
    street_key,
    street_name,
)
from app.services.auth import get_current_dispatcher_or_admin, get_current_user_required
from app.services.geocoding import geocoding_service
from app.services.task_service import _address_match_score
from app.services.tenant_filter import TenantFilter

router = APIRouter(prefix="/api/addresses", tags=["Addresses"])


def get_tenant_address_or_404(
    address_id: int, db: Session, user: UserModel
) -> AddressModel:
    """Получить адрес с tenant-проверкой."""
    address = db.query(AddressModel).filter(AddressModel.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Адрес не найден")

    TenantFilter(user).enforce_access(address, detail="Нет доступа к этому адресу")
    return address


@router.post("/parse", response_model=AddressParseResponse)
def parse_address_endpoint(
    data: AddressParseRequest, user: UserModel = Depends(get_current_user_required)
):
    """Парсит полный адрес на составные части (город, улица, дом, корпус, подъезд)"""
    parsed = parse_address(data.address)
    return AddressParseResponse(
        city=parsed.city,
        street=parsed.street,
        building=parsed.building,
        corpus=parsed.corpus,
        entrance=parsed.entrance,
    )


@router.post("/compose", response_model=AddressComposeResponse)
def compose_address_endpoint(
    data: AddressComposeRequest, user: UserModel = Depends(get_current_user_required)
):
    """Собирает полный адрес из составных частей"""
    address = compose_address(
        city=data.city or "",
        street=data.street or "",
        building=data.building or "",
        corpus=data.corpus or "",
        entrance=data.entrance or "",
    )
    return AddressComposeResponse(address=address)


@router.get("", response_model=AddressListResponse)
def get_addresses(
    search: Optional[str] = Query(None, description="Поиск по адресу"),
    city: Optional[str] = Query(None, description="Фильтр по городу"),
    is_active: Optional[bool] = Query(None, description="Фильтр по активности"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    size: int = Query(50, ge=1, le=100, description="Размер страницы"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Получить список адресов с пагинацией и поиском (и по району)"""
    query = db.query(AddressModel)

    # Multi-tenant: фильтрация по организации
    tenant = TenantFilter(user)
    query = tenant.apply(query, AddressModel)

    # Фильтры
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                AddressModel.address.ilike(search_pattern),
                AddressModel.street.ilike(search_pattern),
                AddressModel.building.ilike(search_pattern),
                AddressModel.district.ilike(search_pattern),
            )
        )

    if city:
        query = query.filter(AddressModel.city.ilike(f"%{city}%"))

    if is_active is not None:
        query = query.filter(AddressModel.is_active == is_active)

    # Подсчёт
    total = query.count()

    # Пагинация
    addresses = (
        query.order_by(AddressModel.address).offset((page - 1) * size).limit(size).all()
    )

    return AddressListResponse(
        items=[AddressResponse.model_validate(a) for a in addresses],
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size if total > 0 else 1,
    )


@router.get("/my", response_model=AddressListResponse)
def get_my_addresses(
    search: Optional[str] = Query(None, description="Поиск по адресу"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    size: int = Query(50, ge=1, le=100, description="Размер страницы"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Адреса, назначенные текущему пользователю («Мои адреса»).

    Возвращает только активные адреса, на которые пользователь назначен
    (таблица address_assignees), с tenant-фильтрацией. Менеджеры также видят
    лишь свои привязки — за полным списком есть обычный `GET /api/addresses`.
    """
    tenant = TenantFilter(user)
    query = (
        tenant.apply(db.query(AddressModel), AddressModel)
        .join(
            AddressAssigneeModel,
            AddressAssigneeModel.address_id == AddressModel.id,
        )
        .filter(
            AddressAssigneeModel.user_id == user.id,
            AddressModel.is_active == True,
        )
    )

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                AddressModel.address.ilike(search_pattern),
                AddressModel.street.ilike(search_pattern),
                AddressModel.building.ilike(search_pattern),
            )
        )

    total = query.count()
    addresses = (
        query.order_by(AddressModel.address).offset((page - 1) * size).limit(size).all()
    )

    return AddressListResponse(
        items=[AddressResponse.model_validate(a) for a in addresses],
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size if total > 0 else 1,
    )


@router.get("/search", response_model=list[AddressSearchResponse])
def search_addresses(
    q: str = Query(..., min_length=2, description="Поисковый запрос"),
    limit: int = Query(10, ge=1, le=50, description="Лимит результатов"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Быстрый поиск адресов для автокомплита"""
    search_pattern = f"%{q}%"

    tenant = TenantFilter(user)
    addresses = (
        tenant.apply(db.query(AddressModel), AddressModel)
        .filter(
            AddressModel.is_active == True,
            or_(
                AddressModel.address.ilike(search_pattern),
                AddressModel.street.ilike(search_pattern),
                AddressModel.building.ilike(search_pattern),
            ),
        )
        .order_by(AddressModel.address)
        .limit(limit)
        .all()
    )

    return [AddressSearchResponse.model_validate(a) for a in addresses]


@router.get("/find-by-components", response_model=Optional[AddressSearchResponse])
def find_by_components(
    city: str = Query(..., description="Город"),
    street: str = Query(..., description="Улица"),
    building: str = Query(..., description="Дом"),
    corpus: Optional[str] = Query(None, description="Корпус"),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Найти адрес по компонентам (город, улица, дом, корпус)"""
    tenant = TenantFilter(user)
    query = tenant.apply(db.query(AddressModel), AddressModel).filter(
        AddressModel.is_active == True,
        AddressModel.city == city,
        AddressModel.street == street,
        AddressModel.building == building,
    )

    if corpus and corpus != "none":
        query = query.filter(AddressModel.corpus == corpus)
    else:
        # Если корпус не указан, ищем адрес без корпуса
        query = query.filter(
            (AddressModel.corpus.is_(None)) | (AddressModel.corpus == "")
        )

    address = query.first()
    if address is None:
        # Подсказка справочника пишет «пр-кт Ветеранов», в базе — «Ветеранов
        # пр.»: точное сравнение не находит дом. Тогда — так же, как сервер
        # сам привязывает заявку к адресу книги при создании.
        address = _match_by_parts(db, tenant, city, street, building, corpus)
    if not address:
        return None

    return AddressSearchResponse.model_validate(address)


def _word_like(word: str):
    """Отбор по слову без учёта регистра и в SQLite (там ILIKE — только ASCII)."""
    variants = {word.lower(), word.capitalize()}
    return or_(
        *[AddressModel.address.ilike(f"%{v}%") for v in variants],
        *[AddressModel.street.ilike(f"%{v}%") for v in variants],
    )


def _match_by_parts(db, tenant, city, street, building, corpus):
    parsed = ParsedAddress(
        city=city or None,
        street=street or None,
        building=building or None,
        corpus=corpus if corpus and corpus != "none" else None,
    )
    words = re.findall(r"[^\W\d_]{3,}", street_name(street or ""))
    if not words or not building:
        return None
    word = max(words, key=len)
    candidates = (
        tenant.apply(db.query(AddressModel), AddressModel)
        .filter(
            AddressModel.is_active == True,  # noqa: E712
            _word_like(word),
        )
        .order_by(AddressModel.updated_at.desc())
        .limit(50)
        .all()
    )
    best, best_score = None, 0
    for candidate in candidates:
        score = _address_match_score(parsed, "", candidate)
        # Без корпуса в запросе дом с корпусом — другой дом
        if not parsed.corpus and (candidate.corpus or "").strip():
            continue
        if score > best_score:
            best, best_score = candidate, score
    return best


@router.get("/{address_id}", response_model=AddressResponse)
def get_address(
    address_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Получить адрес по ID"""
    address = get_tenant_address_or_404(address_id, db, user)
    return AddressResponse.model_validate(address)


@router.post("", response_model=AddressResponse, status_code=201)
def create_address(
    data: AddressCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin),
):
    """Создать новый адрес (только admin/dispatcher)"""
    tenant = TenantFilter(user)

    # Проверка на дубликат
    existing = (
        tenant.apply(db.query(AddressModel), AddressModel)
        .filter(AddressModel.address.ilike(data.address))
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Адрес уже существует в базе")

    counterparty = None
    if data.counterparty_id is not None:
        counterparty = (
            db.query(CounterpartyModel)
            .filter(
                CounterpartyModel.id == data.counterparty_id,
                # тот же тенант, что получит адрес (tenant.set_org_id ниже)
                CounterpartyModel.organization_id == tenant.org_id,
            )
            .first()
        )
        if counterparty is None:
            raise HTTPException(status_code=400, detail="Контрагент не найден")

    # Геокодирование если координаты не указаны
    lat, lon = data.lat, data.lon
    if lat is None or lon is None:
        lat, lon = geocoding_service.geocode(data.address)
    house = address_suggest.house_details(data.address) or {}

    address = AddressModel(
        address=data.address,
        city=data.city or "",
        street=data.street or "",
        building=data.building or "",
        corpus=data.corpus or "",
        entrance=data.entrance or "",
        lat=lat,
        lon=lon,
        district=house.get("district"),
        fias_id=house.get("fias_id"),
        entrance_count=data.entrance_count or 1,
        floor_count=data.floor_count or 1,
        apartment_count=data.apartment_count,
        has_elevator=data.has_elevator or False,
        # Код домофона сам говорит, что домофон есть — отдельный флажок не нужен
        has_intercom=bool(data.has_intercom or data.intercom_code),
        intercom_code=data.intercom_code or "",
        counterparty_id=counterparty.id if counterparty else None,
        # Строка «УК» в карточке — по контрагенту, если её не ввели
        management_company=data.management_company
        or (counterparty.name if counterparty else ""),
        management_phone=data.management_phone or "",
        notes=data.notes or "",
        is_active=True,
    )
    tenant.set_org_id(address)

    db.add(address)
    db.commit()
    db.refresh(address)

    return AddressResponse.model_validate(address)


@router.patch("/{address_id}", response_model=AddressResponse)
def update_address(
    address_id: int,
    data: AddressUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin),
):
    """Обновить адрес (только admin/dispatcher)"""
    tenant = TenantFilter(user)
    address = get_tenant_address_or_404(address_id, db, user)

    # Обновляем только переданные поля
    update_data = data.model_dump(exclude_unset=True)

    # Если меняется адрес, проверяем на дубликат
    if "address" in update_data and update_data["address"] != address.address:
        existing = (
            tenant.apply(db.query(AddressModel), AddressModel)
            .filter(
                AddressModel.address.ilike(update_data["address"]),
                AddressModel.id != address_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Такой адрес уже существует")

        # Перегеокодируем при смене адреса — если точку не прислали (её даёт
        # подсказка справочника, она точнее геокодера)
        if update_data.get("lat") is None or update_data.get("lon") is None:
            lat, lon = geocoding_service.geocode(update_data["address"])
            update_data["lat"] = lat
            update_data["lon"] = lon

        # Другой дом — другой район; не узнали дом — старые значения неверны
        house = address_suggest.house_details(update_data["address"]) or {}
        update_data["district"] = house.get("district")
        update_data["fias_id"] = house.get("fias_id")

    if update_data.get("counterparty_id") is not None:
        counterparty = (
            db.query(CounterpartyModel)
            .filter(
                CounterpartyModel.id == update_data["counterparty_id"],
                CounterpartyModel.organization_id == address.organization_id,
            )
            .first()
        )
        if counterparty is None:
            raise HTTPException(status_code=400, detail="Контрагент не найден")
        # Строка «УК» в карточке — по контрагенту
        update_data.setdefault("management_company", counterparty.name)

    old_lat, old_lon = address.lat, address.lon

    for field, value in update_data.items():
        setattr(address, field, value)

    address.updated_at = datetime.now(timezone.utc)

    # Если координаты адреса изменились (смена адреса → перегеокод, либо явная
    # правка lat/lon) — подхватываем их в привязанных заявках.
    if address.lat != old_lat or address.lon != old_lon:
        db.query(TaskModel).filter(TaskModel.address_id == address.id).update(
            {TaskModel.lat: address.lat, TaskModel.lon: address.lon},
            synchronize_session=False,
        )

    db.commit()
    db.refresh(address)

    return AddressResponse.model_validate(address)


@router.delete("/{address_id}", status_code=204)
def delete_address(
    address_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_dispatcher_or_admin),
):
    """Удалить адрес (только admin/dispatcher)"""
    address = get_tenant_address_or_404(address_id, db, user)

    db.delete(address)
    db.commit()

    return None


@router.post("/{address_id}/deactivate", response_model=AddressResponse)
def deactivate_address(
    address_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Деактивировать адрес (мягкое удаление)"""
    address = get_tenant_address_or_404(address_id, db, user)

    address.is_active = False
    address.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(address)

    return AddressResponse.model_validate(address)


# ============================================
# Autocomplete endpoints
# ============================================


def _fold(text: str) -> str:
    return text.casefold().replace("ё", "е")


def _rank_matches(values: List[str], q: str, limit: int) -> List[str]:
    """Совпадения с начала названия, затем с начала слова, затем внутри.

    Фильтрация в Python: lower() в SQLite не понимает кириллицу. Раньше
    сначала брались первые по алфавиту N значений и только потом
    фильтровались — на большой базе нужная улица могла не попасть в выборку.
    """
    query = _fold(q.strip())
    if not query:
        return values[:limit]
    scored = []
    for value in values:
        folded = _fold(value)
        if folded.startswith(query):
            rank = 0
        elif any(word.startswith(query) for word in re.split(r"[\s.,-]+", folded)):
            rank = 1
        elif query in folded:
            rank = 2
        else:
            continue
        scored.append((rank, folded, value))
    scored.sort()
    return [value for _, _, value in scored][:limit]


def _merge(local: List[str], external: List[str], limit: int) -> List[str]:
    """Свои значения первыми, справочник — следом, без повторов."""
    seen = set()
    result = []
    for value in [*local, *external]:
        key = _fold(value)
        if key not in seen:
            seen.add(key)
            result.append(value)
    return result[:limit]


@router.get("/autocomplete/cities", response_model=List[str])
def autocomplete_cities(
    q: str = Query("", description="Поисковый запрос"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Города для автоподставления: свои, затем справочник DaData"""
    tenant = TenantFilter(user)
    rows = (
        tenant.apply(db.query(distinct(AddressModel.city)), AddressModel)
        .filter(AddressModel.city.isnot(None), AddressModel.city != "")
        .order_by(AddressModel.city)
        .all()
    )
    local = _rank_matches([r[0] for r in rows if r[0]], q, limit)
    if len(local) >= limit or not q.strip():
        return local
    # Справочник ищет нечётко — оставляем только то, где есть введённое
    external = _rank_matches(address_suggest.suggest_cities(q, count=limit), q, limit)
    alias = address_suggest.city_alias(q)
    if alias:
        external = [alias, *external]
    return _merge(local, external, limit)


@router.get("/autocomplete/streets", response_model=List[str])
def autocomplete_streets(
    q: str = Query("", description="Поисковый запрос"),
    city: Optional[str] = Query(None, description="Фильтр по городу"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Улицы для автоподставления: свои, затем справочник DaData"""
    tenant = TenantFilter(user)
    query = tenant.apply(db.query(distinct(AddressModel.street)), AddressModel).filter(
        AddressModel.street.isnot(None), AddressModel.street != ""
    )
    if city:
        query = query.filter(AddressModel.city == city)
    rows = query.order_by(AddressModel.street).all()
    local = _rank_matches([r[0] for r in rows if r[0]], q, limit)
    if len(local) >= limit or not q.strip():
        return local
    external = _rank_matches(
        address_suggest.suggest_streets(q, city=city, count=limit), q, limit
    )
    return _merge(local, external, limit)


@router.get("/autocomplete/address", response_model=List[AddressSuggestion])
def autocomplete_address(
    q: str = Query("", description="Адрес как его набирают: «спб ветеранов 46»"),
    limit: int = Query(7, ge=1, le=20),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Подсказки полного адреса: сначала свои объекты, затем справочник.

    Свои — первыми: к ним привязаны системы, панели и история заявок.
    Справочник DaData — если настроен ключ; дома, которые уже есть в базе,
    из него не дублируются. При limit=1 DaData возвращает и координаты.
    """
    query = q.strip()
    if len(query) < 3:
        return []
    own = _base_suggestions(db, user, query, limit=min(limit, 3))
    if not address_suggest.is_enabled():
        return own[:limit]
    external = [
        AddressSuggestion(**item)
        for item in address_suggest.suggest_addresses(query, count=limit)
    ]
    # Дом из своей базы справочник не дублирует. Город сверяем, если он
    # известен: «Ленина, 10» есть и в Петербурге, и в Кронштадте. У старых
    # записей без города убираем только самое верхнее совпадение.
    for item in own:
        if not (item.street and item.building):
            continue
        key = (frozenset(street_key(item.street)), building_key(item.building))
        city = _fold(item.city or "")
        for index, candidate in enumerate(external):
            same_house = (
                frozenset(street_key(candidate.street)),
                building_key(candidate.building),
            ) == key
            if same_house and (not city or _fold(candidate.city or "") == city):
                del external[index]
                break
    return (own + external)[:limit]


def _base_suggestions(db, user, query: str, limit: int) -> List[AddressSuggestion]:
    """Свои адреса, где каждое слово запроса — начало какого-то слова адреса."""
    tokens = re.findall(r"[^\W_]+", _fold(query))
    words = [token for token in tokens if len(token) >= 3 and not token.isdigit()]
    if not words:
        return []
    word = max(words, key=len)
    tenant = TenantFilter(user)
    rows = (
        tenant.apply(db.query(AddressModel), AddressModel)
        .filter(
            AddressModel.is_active == True,  # noqa: E712
            _word_like(word),
        )
        .order_by(AddressModel.address)
        .limit(100)
        .all()
    )
    result = []
    for row in rows:
        haystack = re.findall(r"[^\W_]+", _fold(f"{row.address} {row.city or ''}"))
        if all(any(w.startswith(t) for w in haystack) for t in tokens):
            # У старых записей части не разобраны — разбираем строку, иначе
            # справочник продублирует этот дом, а форма не получит частей
            parsed = (
                parse_address(row.address)
                if not (row.street and row.building)
                else None
            )
            result.append(
                AddressSuggestion(
                    value=row.address,
                    city=row.city or (parsed.city if parsed else "") or "",
                    street=row.street or (parsed.street if parsed else "") or "",
                    building=row.building or (parsed.building if parsed else "") or "",
                    corpus=row.corpus or (parsed.corpus if parsed else "") or "",
                    lat=row.lat,
                    lon=row.lon,
                    source="base",
                    address_id=row.id,
                )
            )
        if len(result) >= limit:
            break
    return result


@router.get("/autocomplete/buildings", response_model=List[str])
def autocomplete_buildings(
    q: str = Query("", description="Поисковый запрос"),
    city: Optional[str] = Query(None, description="Фильтр по городу"),
    street: Optional[str] = Query(None, description="Фильтр по улице"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Получить список уникальных домов для автоподставления"""
    tenant = TenantFilter(user)

    # Строим базовый query
    query = tenant.apply(
        db.query(distinct(AddressModel.building)), AddressModel
    ).filter(AddressModel.building.isnot(None), AddressModel.building != "")

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
def autocomplete_full_address(
    q: str = Query("", description="Поисковый запрос по полному адресу"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Поиск адресов по полному адресу для автоподставления в заявках"""
    tenant = TenantFilter(user)
    query = tenant.apply(db.query(AddressModel), AddressModel).filter(
        AddressModel.is_active == True
    )

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
def autocomplete_corpus(
    city: str = Query(..., description="Город"),
    street: str = Query(..., description="Улица"),
    building: str = Query(..., description="Дом"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Получить список уникальных корпусов для адреса"""
    tenant = TenantFilter(user)
    results = (
        tenant.apply(db.query(distinct(AddressModel.corpus)), AddressModel)
        .filter(
            AddressModel.corpus.isnot(None),
            AddressModel.corpus != "",
            AddressModel.city == city,  # Точное совпадение
            AddressModel.street == street,  # Точное совпадение
            AddressModel.building == building,  # Точное совпадение
        )
        .order_by(AddressModel.corpus)
        .limit(limit)
        .all()
    )

    return [r[0] for r in results if r[0]]


@router.get("/autocomplete/entrance", response_model=List[str])
def autocomplete_entrance(
    city: str = Query(..., description="Город"),
    street: str = Query(..., description="Улица"),
    building: str = Query(..., description="Дом"),
    corpus: Optional[str] = Query(None, description="Корпус"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user_required),
):
    """Получить список подъездов на основе entrance_count адреса"""
    tenant = TenantFilter(user)
    query = tenant.apply(db.query(AddressModel), AddressModel).filter(
        AddressModel.city == city,
        AddressModel.street == street,
        AddressModel.building == building,
    )

    if corpus and corpus != "none":
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
