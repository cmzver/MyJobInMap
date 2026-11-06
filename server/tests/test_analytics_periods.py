"""Периоды аналитики считаются по календарю бизнеса (Europe/Moscow, UTC+3)."""

from datetime import datetime, timezone

from app.services.analytics_periods import resolve_analytics_period


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


# 6 ноября 2026, 01:30 по Москве = 5 ноября 22:30 UTC
NIGHT = utc(2026, 11, 5, 22, 30)


def test_today_starts_at_local_midnight():
    start, end, days = resolve_analytics_period("today", None, None, now=NIGHT)
    assert start == utc(2026, 11, 5, 21, 0)  # 00:00 МСК 6 ноября
    assert end == NIGHT and days == 1


def test_yesterday_is_whole_local_day():
    start, end, _ = resolve_analytics_period("yesterday", None, None, now=NIGHT)
    assert start == utc(2026, 11, 4, 21, 0)
    assert end == utc(2026, 11, 5, 20, 59, 59, 999999)


def test_month_uses_local_date_near_month_boundary():
    # 1 декабря 01:00 МСК — уже декабрь, хотя в UTC ещё 30 ноября
    now = utc(2026, 11, 30, 22, 0)
    start, _, days = resolve_analytics_period("month", None, None, now=now)
    assert start == utc(2026, 11, 30, 21, 0)
    assert days == 1


def test_week_starts_on_local_monday():
    # Пн 9 ноября 00:30 МСК = вс 8 ноября 21:30 UTC
    now = utc(2026, 11, 8, 21, 30)
    start, _, days = resolve_analytics_period("week", None, None, now=now)
    assert start == utc(2026, 11, 8, 21, 0)
    assert days == 1


def test_custom_range_covers_local_days():
    start, end, days = resolve_analytics_period(
        "custom", "2026-11-01", "2026-11-03", now=NIGHT
    )
    assert start == utc(2026, 10, 31, 21, 0)
    assert end == utc(2026, 11, 3, 20, 59, 59, 999999)
    assert days == 3


def test_all_is_unbounded():
    assert resolve_analytics_period("all", None, None, now=NIGHT) == (None, None, None)


def test_sla_week_trend_starts_on_local_monday(client_with_auth):
    from datetime import timedelta

    from app.services.business_time import business_tz

    today = datetime.now(timezone.utc).astimezone(business_tz()).date()
    monday = today - timedelta(days=today.weekday())
    trends = client_with_auth.get("/api/sla?period=week").json()["trends"]
    assert trends[0]["date"] == monday.isoformat()
    assert trends[-1]["date"] == today.isoformat()
