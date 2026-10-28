"""
Tests for the on-demand WireGuard manager
=========================================
Проверяем рефкаунт, единственный up на серию сессий, отложенный teardown
по лингеру и его отмену при повторном обращении. Реальный wg-quick не
вызывается — подменяем _bring_up/_bring_down.
"""

import asyncio

from app.config import settings
from app.services.wireguard import WireGuardError, WireGuardManager


def _make(monkeypatch, enabled=True, linger=0.05):
    monkeypatch.setattr(settings, "BEWARD_WG_ENABLED", enabled)
    monkeypatch.setattr(settings, "BEWARD_WG_LINGER", linger)
    m = WireGuardManager()
    ups: list[int] = []
    downs: list[int] = []

    async def fake_up():
        ups.append(1)

    async def fake_down():
        downs.append(1)

    monkeypatch.setattr(m, "_bring_up", fake_up)
    monkeypatch.setattr(m, "_bring_down", fake_down)
    return m, ups, downs


def test_disabled_is_noop(monkeypatch):
    m, ups, downs = _make(monkeypatch, enabled=False)

    async def go():
        async with m.session():
            pass

    asyncio.run(go())
    assert ups == []
    assert downs == []


def test_single_up_and_teardown_after_linger(monkeypatch):
    m, ups, downs = _make(monkeypatch, linger=0.05)

    async def go():
        # Вложенные сессии делят один up.
        async with m.session():
            async with m.session():
                assert ups == [1]
        # Сессии закрыты, но лингер ещё не истёк.
        assert downs == []
        await asyncio.sleep(0.12)
        assert downs == [1]

    asyncio.run(go())
    assert ups == [1]


def test_reacquire_cancels_teardown(monkeypatch):
    m, ups, downs = _make(monkeypatch, linger=0.05)

    async def go():
        async with m.session():
            pass
        await asyncio.sleep(0.01)  # меньше лингера
        async with m.session():  # должно отменить отложенный down
            pass
        assert ups == [1]  # повторного up не было
        assert downs == []  # down отменён
        await asyncio.sleep(0.12)
        assert downs == [1]

    asyncio.run(go())


def test_bring_up_error_propagates(monkeypatch):
    m, ups, downs = _make(monkeypatch)

    async def boom():
        raise WireGuardError("no iface")

    monkeypatch.setattr(m, "_bring_up", boom)

    async def go():
        try:
            async with m.session():
                pass
        except WireGuardError:
            return "raised"
        return "ok"

    assert asyncio.run(go()) == "raised"
    assert downs == []
