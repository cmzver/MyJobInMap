"""Метки UTC в ответах, собранных вручную, — с «Z», иначе браузер сдвигает их."""

from datetime import datetime, timedelta, timezone

from app.schemas.datetime_utc import iso_utc


def test_naive_db_value_gets_utc_marker():
    assert iso_utc(datetime(2026, 11, 7, 9, 0)) == "2026-11-07T09:00:00Z"


def test_aware_value_is_converted_to_utc():
    moscow = timezone(timedelta(hours=3))
    assert iso_utc(datetime(2026, 11, 7, 12, 0, tzinfo=moscow)) == (
        "2026-11-07T09:00:00Z"
    )


def test_none_stays_none():
    assert iso_utc(None) is None
