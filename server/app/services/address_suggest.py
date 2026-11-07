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
        response = httpx.post(
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


def suggest_addresses(query: str, count: int = 7) -> List[Dict[str, Any]]:
    """Полные адреса (до дома) для поля «Полный адрес»."""
    query = query.strip()[:MAX_QUERY_LENGTH]
    if len(query) < 3:
        return []
    body: Dict[str, Any] = {"query": query, "count": min(max(count, 1), 20)}
    boost = _boost()
    if boost:
        body["locations_boost"] = boost
    return [_to_item(s) for s in _request(body)]


def suggest_cities(query: str, count: int = 10) -> List[str]:
    """Города и посёлки — без типа («Санкт-Петербург», «Новоселье»)."""
    query = query.strip()[:MAX_QUERY_LENGTH]
    if not query:
        return []
    body: Dict[str, Any] = {
        "query": query,
        "count": min(max(count, 1), 20),
        "from_bound": {"value": "city"},
        "to_bound": {"value": "settlement"},
    }
    boost = _boost()
    if boost:
        body["locations_boost"] = boost
    names = [_locality(s.get("data") or {}) for s in _request(body)]
    return _unique([name for name in names if name])


def suggest_streets(
    query: str, city: Optional[str] = None, count: int = 10
) -> List[str]:
    """Улицы с типом («пр-кт Ветеранов»), в городе или посёлке, если он задан."""
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
        # Условия в locations объединяются через «или»
        body["locations"] = [{"city": city}, {"settlement": city}]
    else:
        boost = _boost()
        if boost:
            body["locations_boost"] = boost
    names = [
        (s.get("data") or {}).get("street_with_type") or "" for s in _request(body)
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
