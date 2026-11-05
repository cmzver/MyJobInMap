"""CORS_ORIGINS из .env: строка через запятую (как в описании) или JSON."""

import pytest

from app.config import Settings


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("https://portal.example.ru", ["https://portal.example.ru"]),
        ("https://a.ru, https://b.ru,", ["https://a.ru", "https://b.ru"]),
        ('["https://c.ru"]', ["https://c.ru"]),
    ],
)
def test_cors_origins_from_env(monkeypatch, raw, expected):
    monkeypatch.setenv("CORS_ORIGINS", raw)
    assert Settings().CORS_ORIGINS == expected
