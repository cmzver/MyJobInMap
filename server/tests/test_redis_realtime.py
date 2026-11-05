"""Несколько процессов API: шина WebSocket, общий лимитер входа, лидерство.

Redis — fakeredis: два «процесса» здесь — два ConnectionManager с общим
сервером Redis, как два uvicorn-процесса с одним Redis в проде.
"""

import asyncio

import fakeredis
import pytest

from app.config import settings
from app.services import redis_realtime
from app.services.rate_limiter import SharedRateLimiter
from app.services.websocket_manager import ConnectionManager


class FakeSocket:
    def __init__(self):
        self.sent = []

    async def accept(self):
        return None

    async def send_json(self, message):
        self.sent.append(message)


@pytest.fixture
def redis_server(monkeypatch):
    server = fakeredis.FakeServer()
    monkeypatch.setattr(settings, "REALTIME_REDIS_ENABLED", True)
    redis_realtime.set_clients(
        fakeredis.FakeAsyncRedis(server=server, decode_responses=True),
        fakeredis.FakeRedis(server=server, decode_responses=True),
    )
    yield server
    redis_realtime.set_clients(None, None)


async def _settle(predicate, timeout=2.0):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while not predicate():
        if loop.time() > deadline:
            raise AssertionError("событие не доставлено")
        await asyncio.sleep(0.01)


def test_events_reach_sockets_of_every_process(redis_server):
    async def scenario():
        first, second = ConnectionManager(), ConnectionManager()
        ws_first, ws_second, ws_other_org = FakeSocket(), FakeSocket(), FakeSocket()
        await first.connect(ws_first, user_id=1, organization_id=10)
        await second.connect(ws_second, user_id=2, organization_id=10)
        await second.connect(ws_other_org, user_id=3, organization_id=20)
        tasks = [
            asyncio.create_task(redis_realtime._subscribe_loop(m.handle_bus_message))
            for m in (first, second)
        ]
        await asyncio.sleep(0.1)  # подписки установлены
        try:
            # Событие случилось в первом процессе, получатель — во втором
            await first.send_to_user(2, {"type": "ping"})
            await _settle(lambda: ws_second.sent)
            assert ws_second.sent == [{"type": "ping"}]
            assert ws_first.sent == []

            await first.broadcast({"type": "task_updated"}, organization_id=10)
            await _settle(lambda: len(ws_second.sent) == 2 and ws_first.sent)
            assert ws_other_org.sent == []  # чужая организация не видит

            await second.send_to_conversation([1, 2, 3], {"type": "chat"}, 3)
            await _settle(lambda: len(ws_first.sent) == 2)
            assert ws_first.sent[-1] == {"type": "chat"}
            assert ws_other_org.sent == []  # исключённый отправитель
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    asyncio.run(scenario())


def test_falls_back_to_local_delivery_when_redis_is_down(monkeypatch):
    class BrokenRedis:
        async def publish(self, *args, **kwargs):
            raise ConnectionError("redis down")

    monkeypatch.setattr(settings, "REALTIME_REDIS_ENABLED", True)
    redis_realtime.set_clients(BrokenRedis(), None)
    try:

        async def scenario():
            manager, ws = ConnectionManager(), FakeSocket()
            await manager.connect(ws, user_id=1, organization_id=10)
            sent = await manager.send_to_user(1, {"type": "ping"})
            assert sent == 1
            assert ws.sent == [{"type": "ping"}]

        asyncio.run(scenario())
    finally:
        redis_realtime.set_clients(None, None)


def test_without_redis_delivery_stays_local(monkeypatch):
    monkeypatch.setattr(settings, "REALTIME_REDIS_ENABLED", False)

    async def scenario():
        manager, ws = ConnectionManager(), FakeSocket()
        await manager.connect(ws, user_id=1, organization_id=10)
        assert await manager.broadcast({"type": "x"}, organization_id=10) == 1

    asyncio.run(scenario())
    assert redis_realtime.is_leader() is True


def test_login_limit_is_shared_between_processes(redis_server):
    first = SharedRateLimiter("login-test", max_attempts=3, window_seconds=60)
    second = SharedRateLimiter("login-test", max_attempts=3, window_seconds=60)
    assert first.is_allowed("10.0.0.1") == (True, 2)
    assert second.is_allowed("10.0.0.1") == (True, 1)
    assert first.is_allowed("10.0.0.1") == (True, 0)
    allowed, _ = second.is_allowed("10.0.0.1")
    assert allowed is False
    assert 0 < second.get_retry_after("10.0.0.1") <= 60
    first.reset("10.0.0.1")
    assert second.is_allowed("10.0.0.1")[0] is True


def test_login_limit_falls_back_to_memory(monkeypatch):
    class BrokenRedis:
        def pipeline(self):
            raise ConnectionError("redis down")

    monkeypatch.setattr(settings, "REALTIME_REDIS_ENABLED", True)
    redis_realtime.set_clients(None, BrokenRedis())
    try:
        limiter = SharedRateLimiter("login-fallback", max_attempts=1, window_seconds=60)
        assert limiter.is_allowed("10.0.0.2")[0] is True
        assert limiter.is_allowed("10.0.0.2")[0] is False
    finally:
        redis_realtime.set_clients(None, None)


def test_only_one_process_leads(redis_server, monkeypatch):
    async def scenario():
        monkeypatch.setattr(redis_realtime, "PROCESS_ID", "api-1")
        assert await redis_realtime._try_lead() is True
        monkeypatch.setattr(redis_realtime, "PROCESS_ID", "api-2")
        assert await redis_realtime._try_lead() is False
        monkeypatch.setattr(redis_realtime, "PROCESS_ID", "api-1")
        assert await redis_realtime._try_lead() is True  # продление
        # Лидер ушёл — аренду забирает следующий
        await redis_realtime._release_leadership()
        monkeypatch.setattr(redis_realtime, "PROCESS_ID", "api-2")
        assert await redis_realtime._try_lead() is True

    asyncio.run(scenario())


def test_not_leader_skips_scheduled_backup(redis_server, monkeypatch):
    from app.services import backup_scheduler

    monkeypatch.setattr(redis_realtime, "_is_leader", False)
    called = []
    monkeypatch.setattr(
        backup_scheduler.db_backup, "create_dump", lambda *a: called.append(a)
    )
    assert backup_scheduler._run_backup() is None
    assert called == []
