"""Расчёт следующего рабочего окна в часовом поясе бизнеса."""

from datetime import datetime, time, timedelta, timezone

from app.services.business_time import business_tz, to_naive_utc


def next_working_time(calendar, now: datetime) -> datetime:
    aware = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
    local = aware.astimezone(business_tz())
    start, end = time.fromisoformat(calendar.start_time), time.fromisoformat(
        calendar.end_time
    )
    for offset in range(740):
        day = local.date() + timedelta(days=offset)
        if (
            day.weekday() not in calendar.weekdays
            or day.isoformat() in calendar.excluded_dates
        ):
            continue
        opens = datetime.combine(day, start, business_tz())
        closes = datetime.combine(day, end, business_tz())
        candidate = max(local, opens)
        if candidate < closes:
            return to_naive_utc(candidate)
    raise ValueError("Не найдено рабочее окно календаря")
