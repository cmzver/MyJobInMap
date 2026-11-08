"""Кому уходят события заявок по WebSocket.

Диспетчеры и администраторы организации получают все события её заявок,
мастер — только по заявкам, назначенным ему; при переназначении — и прежний,
и новый исполнитель (у прежнего заявка должна исчезнуть).
"""

import asyncio

import fakeredis
import pytest

from app.config import settings
from app.models import TaskModel, TaskStatus
from app.models.outbox import OutboxEventModel
from app.models.user import UserModel
from app.services import outbox_service, redis_realtime
from app.services import websocket_manager as wsm
from app.services.auth import get_password_hash
from app.services.websocket_manager import ConnectionManager


class FakeSocket:
    def __init__(self):
        self.sent = []

    async def accept(self):
        return None

    async def send_json(self, message):
        self.sent.append(message)


async def _org_sockets(manager):
    sockets = {
        "dispatcher": FakeSocket(),
        "worker_a": FakeSocket(),
        "worker_b": FakeSocket(),
        "other_org_dispatcher": FakeSocket(),
        "superadmin": FakeSocket(),
    }
    await manager.connect(
        sockets["dispatcher"], user_id=1, organization_id=10, sees_all_tasks=True
    )
    await manager.connect(sockets["worker_a"], user_id=2, organization_id=10)
    await manager.connect(sockets["worker_b"], user_id=3, organization_id=10)
    await manager.connect(
        sockets["other_org_dispatcher"],
        user_id=4,
        organization_id=20,
        sees_all_tasks=True,
    )
    await manager.connect(
        sockets["superadmin"], user_id=5, organization_id=None, is_superadmin=True
    )
    return sockets


def _received(sockets):
    return {name for name, ws in sockets.items() if ws.sent}


def test_worker_gets_only_own_task_events():
    async def scenario():
        manager = ConnectionManager()
        sockets = await _org_sockets(manager)
        await manager.broadcast(
            {"type": "task_updated"}, organization_id=10, task_user_ids=[2, None]
        )
        return sockets

    sockets = asyncio.run(scenario())
    assert _received(sockets) == {"dispatcher", "worker_a", "superadmin"}


def test_reassignment_reaches_old_and_new_assignee(monkeypatch):
    async def scenario():
        manager = ConnectionManager()
        monkeypatch.setattr(wsm, "ws_manager", manager)
        sockets = await _org_sockets(manager)
        await wsm.broadcast_task_assigned(
            task_id=7,
            task_number="Z-7",
            assigned_user_id=3,
            assigned_user_name="B",
            organization_id=10,
            task_user_ids=[3, 2],
        )
        return sockets

    sockets = asyncio.run(scenario())
    assert _received(sockets) == {"dispatcher", "worker_a", "worker_b", "superadmin"}
    assert [m["type"] for m in sockets["worker_a"].sent] == ["task_assigned"]
    assert [m["type"] for m in sockets["worker_b"].sent] == [
        "task_assigned_to_me",
        "task_assigned",
    ]


def test_non_task_broadcast_is_unchanged():
    async def scenario():
        manager = ConnectionManager()
        sockets = await _org_sockets(manager)
        await manager.broadcast({"type": "act_updated"}, organization_id=10)
        return sockets

    sockets = asyncio.run(scenario())
    assert _received(sockets) == {"dispatcher", "worker_a", "worker_b", "superadmin"}


def test_helpers_default_to_managers_only(monkeypatch):
    """Хелпер без списка исполнителей мастерам ничего не шлёт."""

    async def scenario():
        manager = ConnectionManager()
        monkeypatch.setattr(wsm, "ws_manager", manager)
        sockets = await _org_sockets(manager)
        await wsm.broadcast_task_deleted(
            task_id=7, task_number="Z-7", organization_id=10
        )
        return sockets

    sockets = asyncio.run(scenario())
    assert _received(sockets) == {"dispatcher", "superadmin"}


def test_filter_survives_redis_bus(monkeypatch):
    server = fakeredis.FakeServer()
    monkeypatch.setattr(settings, "REALTIME_REDIS_ENABLED", True)
    redis_realtime.set_clients(
        fakeredis.FakeAsyncRedis(server=server, decode_responses=True),
        fakeredis.FakeRedis(server=server, decode_responses=True),
    )

    async def scenario():
        sender, receiver = ConnectionManager(), ConnectionManager()
        sockets = await _org_sockets(receiver)
        loop = asyncio.create_task(
            redis_realtime._subscribe_loop(receiver.handle_bus_message)
        )
        await asyncio.sleep(0.1)
        try:
            await sender.broadcast(
                {"type": "task_updated"}, organization_id=10, task_user_ids=[3]
            )
            deadline = asyncio.get_running_loop().time() + 2
            while not sockets["dispatcher"].sent:
                assert asyncio.get_running_loop().time() < deadline
                await asyncio.sleep(0.01)
        finally:
            loop.cancel()
            await asyncio.gather(loop, return_exceptions=True)
        return sockets

    try:
        sockets = asyncio.run(scenario())
    finally:
        redis_realtime.set_clients(None, None)
    assert _received(sockets) == {"dispatcher", "worker_b", "superadmin"}


def _user(db_session, username, role="worker"):
    user = UserModel(
        username=username,
        password_hash=get_password_hash("pass"),
        full_name=username,
        role=role,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


def _task_events(db_session):
    return [
        row.payload
        for row in db_session.query(OutboxEventModel)
        .filter_by(kind="task")
        .order_by(OutboxEventModel.id)
    ]


def test_outbox_reassignment_audience(client_with_auth, db_session):
    worker_a = _user(db_session, "wa")
    worker_b = _user(db_session, "wb")
    task = TaskModel(
        title="Невская 9",
        raw_address="ул. Невская, д. 9",
        description="",
        status=TaskStatus.NEW.value,
        assigned_user_id=worker_a.id,
    )
    db_session.add(task)
    db_session.commit()

    response = client_with_auth.patch(
        f"/api/tasks/{task.id}/assign", json={"assigned_user_id": worker_b.id}
    )
    assert response.status_code == 200, response.text

    payload = _task_events(db_session)[-1]
    assert payload["event"]["type"] == "task_assigned"
    assert payload["task_user_ids"] == sorted([worker_a.id, worker_b.id])

    response = client_with_auth.patch(
        f"/api/admin/tasks/{task.id}", json={"assigned_user_id": None}
    )
    assert response.status_code == 200, response.text
    assert _task_events(db_session)[-1]["task_user_ids"] == [worker_b.id]


def test_outbox_dispatch_filters_workers(monkeypatch):
    async def scenario():
        manager = ConnectionManager()
        monkeypatch.setattr(wsm, "ws_manager", manager)
        sockets = await _org_sockets(manager)
        await outbox_service.dispatch_event(
            "task",
            {
                "event": {"type": "task_status_changed"},
                "organization_id": 10,
                "exclude_user_id": None,
                "task_user_ids": [3],
            },
        )
        return sockets

    sockets = asyncio.run(scenario())
    assert _received(sockets) == {"dispatcher", "worker_b", "superadmin"}


@pytest.mark.parametrize("role, expected", [("worker", False), ("dispatcher", True)])
def test_ws_auth_marks_managers(db_session, role, expected):
    from app.api.websocket import _authenticate_websocket_user
    from app.services.auth import create_access_token

    user = _user(db_session, f"ws-{role}", role=role)
    token = create_access_token(
        {"sub": user.username, "user_id": user.id, "auth_version": user.auth_version}
    )
    context = _authenticate_websocket_user(token, db_session)
    assert context is not None
    assert context[3] is expected
