"""Подсказки адресов из справочника DaData (ФИАС).

Свои адреса подсказывают только то, что уже заведено; справочник знает все
города, улицы и дома. Ключ (DADATA_API_KEY) живёт только на сервере, клиенты
ходят через наш API. Без ключа или при сбое DaData подсказки молча берутся
из своей базы — форма адреса работает и без справочника.

Бесплатный тариф — 10 000 запросов в сутки на все подсказки, поэтому ответы
кэшируются, а клиенты ждут паузу в наборе (debounce) перед запросом.
"""

import logging
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DADATA_SUGGEST_URL = (
    "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address"
)
MAX_QUERY_LENGTH = 300  # ограничение DaData
_CACHE_TTL_SECONDS = 24 * 3600
_CACHE_MAX_ITEMS = 5000

_cache: "OrderedDict[tuple, tuple[float, list]]" = OrderedDict()

# Одно соединение на процесс: без keep-alive каждая подсказка заново
# открывала TLS к DaData и иногда упиралась в тайм-аут подключения.
_client: Optional[httpx.Client] = None


def _http_post(url: str, json: Dict[str, Any], headers: Dict[str, str], timeout: float):
    global _client
    if _client is None:
        _client = httpx.Client()
    return _client.post(url, json=json, headers=headers, timeout=timeout)


def is_enabled() -> bool:
    return bool(settings.DADATA_API_KEY)


def _boost() -> List[Dict[str, str]]:
    return [
        {"kladr_id": code.strip()}
        for code in settings.ADDRESS_SUGGEST_BOOST_KLADR.split(",")
        if code.strip()
    ]


def _cache_get(key: tuple) -> Optional[list]:
    entry = _cache.get(key)
    if entry is None:
        return None
    stored_at, value = entry
    if time.monotonic() - stored_at > _CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    _cache.move_to_end(key)
    return value


def _cache_put(key: tuple, value: list) -> None:
    _cache[key] = (time.monotonic(), value)
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX_ITEMS:
        _cache.popitem(last=False)


def clear_cache() -> None:
    _cache.clear()


def _request(body: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Сырые suggestions[] от DaData; [] — если справочник недоступен."""
    if not is_enabled():
        return []
    key = tuple(sorted((k, repr(v)) for k, v in body.items()))
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        response = _http_post(
            DADATA_SUGGEST_URL,
            json=body,
            headers={
                "Authorization": f"Token {settings.DADATA_API_KEY}",
                "Accept": "application/json",
            },
            timeout=settings.DADATA_TIMEOUT,
        )
        response.raise_for_status()
        suggestions = response.json().get("suggestions") or []
    except (httpx.HTTPError, ValueError) as exc:
        # Ключ в сообщение не попадает: он только в заголовке запроса
        logger.warning("DaData: подсказки недоступны (%s)", type(exc).__name__)
        return []
    _cache_put(key, suggestions)
    return suggestions


def _locality(data: Dict[str, Any]) -> str:
    """Город или посёлок — то, что в карточке адреса лежит в поле «Город»."""
    return data.get("city") or data.get("settlement") or ""


def _to_item(suggestion: Dict[str, Any]) -> Dict[str, Any]:
    data = suggestion.get("data") or {}

    def coord(name: str) -> Optional[float]:
        value = data.get(name)
        try:
            return float(value) if value not in (None, "") else None
        except (TypeError, ValueError):
            return None

    building = data.get("house") or ""
    block_type = (data.get("block_type") or "").lower()
    block = data.get("block") or ""
    # Корпус — в своё поле; строение/литера — к номеру дома
    if block and block_type not in ("к", "корп", "корпус"):
        building = (
            f"{building} {data.get('block_type_full') or block_type} {block}".strip()
        )
        block = ""

    return {
        "value": suggestion.get("value") or "",
        "unrestricted_value": suggestion.get("unrestricted_value") or "",
        "city": _locality(data),
        "street": data.get("street_with_type") or "",
        "building": building,
        "corpus": block,
        "lat": coord("geo_lat"),
        "lon": coord("geo_lon"),
        "source": "dadata",
    }


def _district(data: Dict[str, Any]) -> str:
    """Район города («Невский р-н»), а для посёлков области — район области."""
    return data.get("city_district_with_type") or data.get("area_with_type") or ""


def house_details(address: str) -> Optional[Dict[str, Any]]:
    """
    Район и код дома ФИАС по строке адреса — только если справочник узнал
    именно дом (не улицу). None — справочник выключен, недоступен или дом
    не найден: адрес сохраняется и без этих полей.
    """
    query = address.strip()[:MAX_QUERY_LENGTH]
    if len(query) < 3:
        return None
    body: Dict[str, Any] = {"query": query, "count": 1, "to_bound": {"value": "house"}}
    boost = _boost()
    if boost:
        body["locations_boost"] = boost
    found = _request(body)
    if not found:
        return None
    data = found[0].get("data") or {}
    # Справочник нашёл улицу, а не дом — район по ней не надёжен
    if not data.get("house"):
        return None
    district = _district(data) or None
    # Код дома ФИАС бесплатные подсказки отдают не для всех домов
    fias_id = data.get("house_fias_id") or None
    if not district and not fias_id:
        return None
    return {"district": district, "fias_id": fias_id}


# Так город часто пишут в своей базе — справочник знает его полное имя
_CITY_ALIASES = {"спб": "Санкт-Петербург", "питер": "Санкт-Петербург"}

# «Улицы», которые улицами не являются: станции метро, «территории»
_NOT_STREET_TYPES = {"м", "метро", "тер", "тер."}


def _is_territory(data: Dict[str, Any]) -> bool:
    """СНТ, «тер» и элементы планировочной структуры — не дома и не города."""
    settlement_type = (data.get("settlement_type") or "").casefold()
    city_type = (data.get("city_type") or "").casefold()
    return (
        str(data.get("fias_level") or "") == "65"
        or settlement_type.startswith("тер")
        or city_type.startswith("тер")
    )


def city_alias(query: str) -> Optional[str]:
    """«спб» → «Санкт-Петербург»; None, если это не известное сокращение."""
    return _CITY_ALIASES.get(query.strip().casefold())


def _regions() -> List[Dict[str, str]]:
    """Регионы работы (те же КЛАДР, что и для приоритета)."""
    return _boost()


def suggest_addresses(query: str, count: int = 7) -> List[Dict[str, Any]]:
    """Полные адреса — до дома, без квартир — для поля «Полный адрес»."""
    query = query.strip()[:MAX_QUERY_LENGTH]
    if len(query) < 3:
        return []
    body: Dict[str, Any] = {
        "query": query,
        "count": min(max(count, 1), 20),
        "to_bound": {"value": "house"},
    }
    boost = _boost()
    if boost:
        # Только приоритет: адрес в другом регионе тоже должен находиться
        body["locations_boost"] = boost
    return [_to_item(s) for s in _request(body)]


def suggest_cities(query: str, count: int = 10) -> List[str]:
    """Города и посёлки регионов работы — без типа («Санкт-Петербург»)."""
    query = query.strip()[:MAX_QUERY_LENGTH]
    if not query:
        return []
    body: Dict[str, Any] = {
        "query": query,
        "count": min(max(count, 1), 20),
        "from_bound": {"value": "city"},
        "to_bound": {"value": "settlement"},
    }
    regions = _regions()
    if regions:
        body["locations"] = regions
    names = [
        _locality(s.get("data") or {})
        for s in _request(body)
        if not _is_territory(s.get("data") or {})
    ]
    return _unique([name for name in names if name])


def suggest_streets(
    query: str, city: Optional[str] = None, count: int = 10
) -> List[str]:
    """Улицы с типом («пр-кт Ветеранов») — в городе/посёлке, если он задан."""
    query = query.strip()[:MAX_QUERY_LENGTH]
    if not query:
        return []
    body: Dict[str, Any] = {
        "query": query,
        "count": min(max(count, 1), 20),
        "from_bound": {"value": "street"},
        "to_bound": {"value": "street"},
    }
    if city:
        name = _CITY_ALIASES.get(city.strip().casefold(), city.strip())
        # Условия в locations объединяются через «или»
        body["locations"] = [{"city": name}, {"settlement": name}]
    else:
        regions = _regions()
        if regions:
            body["locations"] = regions
    names = [
        (s.get("data") or {}).get("street_with_type") or ""
        for s in _request(body)
        if ((s.get("data") or {}).get("street_type") or "").casefold()
        not in _NOT_STREET_TYPES
        and not _is_territory(s.get("data") or {})
    ]
    return _unique([name for name in names if name])


def _unique(values: List[str]) -> List[str]:
    seen = set()
    result = []
    for value in values:
        key = value.casefold()
        if key not in seen:
            seen.add(key)
            result.append(value)
    return result
