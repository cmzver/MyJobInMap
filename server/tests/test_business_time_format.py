"""Время в выгрузках — по поясу бизнеса, а не UTC."""

from datetime import datetime, timezone

from app.services.business_time import format_local


def test_naive_db_timestamp_is_treated_as_utc():
    # Europe/Moscow = UTC+3 круглый год
    assert format_local(datetime(2026, 11, 6, 21, 30)) == "07.11.2026 00:30"


def test_aware_moment_and_custom_format():
    moment = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    assert format_local(moment, "%H:%M") == "12:00"


def test_none_is_empty_string():
    assert format_local(None) == ""
