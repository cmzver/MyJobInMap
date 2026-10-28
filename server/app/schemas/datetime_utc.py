"""Общие Pydantic-типы для дат/времени.

Серверные событийные таймстампы (created_at/updated_at/edited_at и т.п.) хранятся
как наивный UTC и по умолчанию сериализуются без таймзоны. Клиенты (портал на JS,
Android) тогда трактуют такую строку как локальное время и показывают сдвиг.

`UtcDateTime` сериализует значение в ISO-8601 с суффиксом `Z`, явно помечая его как
UTC, чтобы клиент корректно конвертировал в локальное время.

ВАЖНО: применять только к серверным таймстампам. Пользовательские доменные даты
(planned_date, service_*_date, install_date, warranty_until, valid_*) — это наивное
ЛОКАЛЬНОЕ время, для них тип НЕ используется.
"""

from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer


def _serialize_utc(value: datetime) -> str:
    # Наивное значение из БД считаем UTC; aware — приводим к UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UtcDateTime = Annotated[
    datetime,
    PlainSerializer(_serialize_utc, return_type=str, when_used="json-unless-none"),
]
