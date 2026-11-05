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


# ------------------------------------------------- DDoS-счётчик и сброс кэшей


def test_ddos_counter_is_shared_between_processes(redis_server):
    from app.services.rate_limiter import SharedWindowCounter

    first = SharedWindowCounter("ddos-test", max_attempts=3, window_seconds=60)
    second = SharedWindowCounter("ddos-test", max_attempts=3, window_seconds=60)
    assert first.is_allowed("8.8.8.8")[0] is True
    assert second.is_allowed("8.8.8.8")[0] is True
    assert first.is_allowed("8.8.8.8")[0] is True
    assert second.is_allowed("8.8.8.8")[0] is False  # 4-й запрос за окно
    assert first.is_allowed("1.1.1.1")[0] is True  # другой IP — свой счётчик
    assert first.get_stats()["tracked_ips"] == 2
    first.clear_all()
    assert second.is_allowed("8.8.8.8")[0] is True


def test_ddos_counter_weights_previous_window(redis_server, monkeypatch):
    from app.services import rate_limiter
    from app.services.rate_limiter import SharedWindowCounter

    counter = SharedWindowCounter("ddos-slide", max_attempts=10, window_seconds=60)
    now = [6000.0]  # начало окна 100
    monkeypatch.setattr(rate_limiter.time, "time", lambda: now[0])
    for _ in range(10):
        assert counter.is_allowed("8.8.8.8")[0] is True
    # Четверть следующего окна: из прошлых 10 в окне ещё 7.5 → до лимита 3
    now[0] = 6075.0
    for _ in range(3):
        assert counter.is_allowed("8.8.8.8")[0] is True
    assert counter.is_allowed("8.8.8.8")[0] is False
    # Через полтора окна прошлые запросы уже не считаются
    now[0] = 6150.0
    assert counter.is_allowed("8.8.8.8")[0] is True


def test_limiter_stops_calling_broken_redis_for_a_while(monkeypatch):
    from app.services.rate_limiter import SharedWindowCounter

    calls = []

    class BrokenRedis:
        def pipeline(self):
            calls.append(1)
            raise ConnectionError("redis down")

    monkeypatch.setattr(settings, "REALTIME_REDIS_ENABLED", True)
    redis_realtime.set_clients(None, BrokenRedis())
    try:
        counter = SharedWindowCounter("ddos-broken", max_attempts=2, window_seconds=60)
        for _ in range(5):
            counter.is_allowed("8.8.8.8")
        assert len(calls) == 1  # дальше — память, без ожидания таймаутов
        assert counter.is_allowed("8.8.8.8")[0] is False  # но лимит работает
    finally:
        redis_realtime.set_clients(None, None)


def test_ddos_ban_threshold_counts_all_processes(redis_server, db_session):
    from app.services.ip_guard import IPGuard
    from app.services.rate_limiter import SharedWindowCounter

    processes = [IPGuard(), IPGuard()]
    for guard in processes:
        guard.refresh(db_session, force=True)
        guard._ddos = SharedWindowCounter("ddos", max_attempts=4, window_seconds=60)
    decisions = [processes[i % 2].evaluate(db_session, "8.8.8.8") for i in range(5)]
    assert decisions[:4] == [None] * 4
    assert decisions[4]["reason"] == "ddos"


def test_invalidation_reaches_other_processes(redis_server):
    calls = []
    redis_realtime.register_invalidator("test-cache", calls.append)

    async def scenario():
        other_process = ConnectionManager()
        task = asyncio.create_task(
            redis_realtime._subscribe_loop(other_process.handle_bus_message)
        )
        await asyncio.sleep(0.1)
        try:
            # Из потока (sync-маршрут) — синхронным клиентом
            await asyncio.to_thread(redis_realtime.invalidate, "test-cache", 7)
            # Свой процесс — сразу, другой — из шины
            await _settle(lambda: calls == ["7", "7"])
            # Из event loop — асинхронной публикацией
            redis_realtime.invalidate("test-cache")
            await _settle(lambda: calls[2:] == [None, None])
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    try:
        asyncio.run(scenario())
    finally:
        redis_realtime._invalidators.pop("test-cache", None)


def test_registered_caches_drop_entries():
    from app.api import websocket as ws_api
    from app.services.ip_guard import ip_guard

    ws_api._member_cache.update({7: (0.0, [1, 2]), 8: (0.0, [3])})
    redis_realtime.apply_invalidation("chat_members", "7")
    assert set(ws_api._member_cache) == {8}
    redis_realtime.apply_invalidation("chat_members", None)
    assert ws_api._member_cache == {}

    ip_guard._cache_at = 123.0
    redis_realtime.apply_invalidation("ip_guard")
    assert ip_guard._cache_at == 0.0


def test_membership_changes_invalidate_chat_cache(db_session, monkeypatch):
    from app.models import UserModel
    from app.services import chat_service

    dropped = []
    monkeypatch.setattr(
        redis_realtime, "invalidate", lambda name, key=None: dropped.append((name, key))
    )
    users = [
        UserModel(username=f"chat{i}", password_hash="x", full_name=f"U{i}")
        for i in range(3)
    ]
    db_session.add_all(users)
    db_session.commit()
    conv = chat_service.create_conversation(
        db_session,
        "group",
        users[0].id,
        None,
        name="Группа",
        member_user_ids=[users[1].id],
    )
    chat_service.add_members(db_session, conv.id, [users[2].id], users[0].id)
    chat_service.remove_member(db_session, conv.id, users[1].id, users[0].id)
    assert dropped == [("chat_members", conv.id), ("chat_members", conv.id)]


# ---------------------------------------------------------------- метрики


def test_metrics_sum_websocket_gauge_over_processes(tmp_path):
    import subprocess
    import sys
    from pathlib import Path

    env = {**__import__("os").environ, "PROMETHEUS_MULTIPROC_DIR": str(tmp_path)}
    server = Path(__file__).resolve().parents[1]
    worker = (
        "import os, sys\n"
        "from app.services import metrics\n"
        "metrics.set_websocket_connections(int(sys.argv[1]))\n"
        "print(os.getpid())\n"
    )
    pids = {}
    for value in ("3", "4", "50"):
        pids[value] = subprocess.run(
            [sys.executable, "-c", worker, value],
            cwd=server,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    # Процесс со значением 50 остановился штатно (на Windows файл открытого
    # процесса не удалить, поэтому отмечаем после выхода — как сделал бы он сам)
    from prometheus_client import multiprocess

    multiprocess.mark_process_dead(int(pids["50"]), str(tmp_path))
    scrape = (
        "from prometheus_client import CollectorRegistry, generate_latest, multiprocess\n"
        "registry = CollectorRegistry()\n"
        "multiprocess.MultiProcessCollector(registry)\n"
        "print(generate_latest(registry).decode())\n"
    )
    out = subprocess.run(
        [sys.executable, "-c", scrape],
        cwd=server,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    # Остановившийся процесс не учитывается, живые складываются
    assert "fieldworker_websocket_connections 7.0" in out


def test_cleanup_drops_gauges_of_crashed_processes(tmp_path, monkeypatch):
    from app.services import metrics

    monkeypatch.setenv("PROMETHEUS_MULTIPROC_DIR", str(tmp_path))
    (tmp_path / "gauge_livesum_111.db").write_bytes(b"")
    (tmp_path / "gauge_livesum_222.db").write_bytes(b"")
    (tmp_path / "counter_111.db").write_bytes(b"")
    monkeypatch.setattr(metrics, "_pid_alive", lambda pid: pid == 222)
    assert metrics.cleanup_dead_processes() == 1
    names = sorted(p.name for p in tmp_path.iterdir())
    # Счётчики упавшего процесса остаются — накопленное не теряется
    assert names == ["counter_111.db", "gauge_livesum_222.db"]
