"""
Business Time
=============
Время в часовом поясе бизнеса (settings.BUSINESS_TIMEZONE).

Метки времени в БД — наивное UTC, а «плановая дата» — наивное локальное время,
как его ввёл пользователь. Всё, что опирается на «сегодня» или «конец дня»,
считается здесь, чтобы не путать одно с другим.
"""

from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.config import settings


@lru_cache(maxsize=None)
def business_tz() -> ZoneInfo:
    return ZoneInfo(settings.BUSINESS_TIMEZONE)


def to_naive_utc(moment: datetime) -> datetime:
    """Момент как наивное UTC — в том виде, в каком метки лежат в БД."""
    if moment.tzinfo is not None:
        moment = moment.astimezone(timezone.utc).replace(tzinfo=None)
    return moment


def to_naive_local(moment: datetime) -> datetime:
    """Плановая дата как наивное местное время.

    Клиенты присылают её без пояса (как ввёл человек). Если пришёл момент
    с поясом — переводим в пояс бизнеса, чтобы в БД не смешались UTC и местное.
    """
    if moment.tzinfo is not None:
        moment = moment.astimezone(business_tz()).replace(tzinfo=None)
    return moment


def business_now_naive() -> datetime:
    """«Сейчас» по местному времени — для сравнения с плановой датой."""
    return datetime.now(business_tz()).replace(tzinfo=None)


def local_day_end_utc(day: date) -> datetime:
    """Конец локального дня (полночь следующего) как наивное UTC."""
    local_end = datetime.combine(day + timedelta(days=1), time.min, business_tz())
    return to_naive_utc(local_end)


def format_local(moment, fmt: str = "%d.%m.%Y %H:%M") -> str:
    """Метка из БД (наивное UTC) или aware-момент — строкой в поясе бизнеса.

    Для выгрузок и документов: люди читают их по местному времени.
    """
    if moment is None:
        return ""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(business_tz()).strftime(fmt)
