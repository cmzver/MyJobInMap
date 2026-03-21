"""
Shared period helpers for analytics endpoints.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional


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


def resolve_analytics_period(
    period: str,
    date_from: Optional[date | str],
    date_to: Optional[date | str],
    *,
    now: Optional[datetime] = None,
) -> tuple[Optional[datetime], Optional[datetime], Optional[int]]:
    """
    Resolve a user-facing analytics period into an inclusive UTC datetime range.

    Calendar periods follow the portal labels:
    - week: current week starting Monday
    - month: current calendar month
    - quarter: current calendar quarter
    - year: current calendar year
    """
    current = now or datetime.now(timezone.utc)
    today = current.date()
    custom_from = _coerce_date(date_from)
    custom_to = _coerce_date(date_to)

    if custom_from and custom_to and custom_to < custom_from:
        custom_from, custom_to = custom_to, custom_from

    if period == "custom" and custom_from and custom_to:
        start = datetime.combine(custom_from, time.min, tzinfo=timezone.utc)
        end = datetime.combine(custom_to, time.max, tzinfo=timezone.utc)
        return start, end, (custom_to - custom_from).days + 1

    if period == "today":
        start = current.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, current, 1

    if period == "yesterday":
        yesterday = today - timedelta(days=1)
        start = datetime.combine(yesterday, time.min, tzinfo=timezone.utc)
        end = datetime.combine(yesterday, time.max, tzinfo=timezone.utc)
        return start, end, 1

    if period == "week":
        days_since_monday = current.weekday()
        start = (current - timedelta(days=days_since_monday)).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        return start, current, days_since_monday + 1

    if period == "month":
        start = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, current, today.day

    if period == "quarter":
        quarter_start_month = ((current.month - 1) // 3) * 3 + 1
        start = current.replace(
            month=quarter_start_month,
            day=1,
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        return start, current, (current - start).days + 1

    if period == "year":
        start = current.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, current, (current - start).days + 1

    if period == "all":
        return None, None, None

    # Unknown values fall back to the current calendar month instead of widening
    # the query to the full dataset.
    start = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, current, today.day
