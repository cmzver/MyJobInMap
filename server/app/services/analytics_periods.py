"""
Shared period helpers for analytics endpoints.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from app.services.business_time import business_tz


def _coerce_date(value: Optional[date | str]) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def _local_midnight(day: date) -> datetime:
    """Полночь дня в поясе бизнеса — как aware UTC."""
    return datetime.combine(day, time.min, business_tz()).astimezone(timezone.utc)


def _local_day_end(day: date) -> datetime:
    """Последний момент дня в поясе бизнеса — как aware UTC."""
    return _local_midnight(day + timedelta(days=1)) - timedelta(microseconds=1)


def business_today_start(now: Optional[datetime] = None) -> datetime:
    """Начало сегодняшнего дня по поясу бизнеса — как aware UTC."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return _local_midnight(current.astimezone(business_tz()).date())


def resolve_analytics_period(
    period: str,
    date_from: Optional[date | str],
    date_to: Optional[date | str],
    *,
    now: Optional[datetime] = None,
) -> tuple[Optional[datetime], Optional[datetime], Optional[int]]:
    """
    Resolve a user-facing analytics period into an inclusive UTC datetime range.

    Границы — по календарю бизнеса (BUSINESS_TIMEZONE): «сегодня» начинается
    в полночь по Москве, а не в 03:00, как было при расчёте в UTC.

    Calendar periods follow the portal labels:
    - week: current week starting Monday
    - month: current calendar month
    - quarter: current calendar quarter
    - year: current calendar year
    """
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(timezone.utc)
    today = current.astimezone(business_tz()).date()
    custom_from = _coerce_date(date_from)
    custom_to = _coerce_date(date_to)

    if custom_from and custom_to and custom_to < custom_from:
        custom_from, custom_to = custom_to, custom_from

    if period == "custom" and custom_from and custom_to:
        start = _local_midnight(custom_from)
        end = _local_day_end(custom_to)
        return start, end, (custom_to - custom_from).days + 1

    if period == "today":
        return _local_midnight(today), current, 1

    if period == "yesterday":
        yesterday = today - timedelta(days=1)
        return _local_midnight(yesterday), _local_day_end(yesterday), 1

    if period == "week":
        days_since_monday = today.weekday()
        start = _local_midnight(today - timedelta(days=days_since_monday))
        return start, current, days_since_monday + 1

    if period == "month":
        return _local_midnight(today.replace(day=1)), current, today.day

    if period == "quarter":
        quarter_start_month = ((today.month - 1) // 3) * 3 + 1
        first = today.replace(month=quarter_start_month, day=1)
        return _local_midnight(first), current, (today - first).days + 1

    if period == "year":
        first = today.replace(month=1, day=1)
        return _local_midnight(first), current, (today - first).days + 1

    if period == "all":
        return None, None, None

    # Unknown values fall back to the current calendar month instead of widening
    # the query to the full dataset.
    return _local_midnight(today.replace(day=1)), current, today.day
