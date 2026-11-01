"""Откат, повтор HTTP-ответа и повторная доставка после сбоя."""

import asyncio
from datetime import timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.models import CommentModel, TaskModel
from app.models.outbox import OutboxEventModel
from app.services import outbox_service


def test_status_key_and_change_are_atomic(
    client, auth_headers, db_session, monkeypatch
):
    from app.api.tasks import core

    task = TaskModel(title="Работа", raw_address="Ленина, 1", status="NEW")
    db_session.add(task)
    db_session.commit()
    task_id = task.id

    def fail(*args, **kwargs):
        raise RuntimeError("simulate failure before commit")

    monkeypatch.setattr(core, "stage_response", fail)
    with pytest.raises(RuntimeError):
        client.patch(
            f"/api/tasks/{task_id}/status",
            headers={**auth_headers, "Idempotency-Key": "atomic"},
            json={"status": "IN_PROGRESS", "expected_version": 1},
        )
    db_session.rollback()
    assert db_session.get(TaskModel, task_id).status == "NEW"
    assert db_session.query(CommentModel).count() == 0


def test_lost_response_retry_precedes_version_check(client, auth_headers, db_session):
    task = TaskModel(title="Работа", raw_address="Ленина, 1", status="NEW")
    db_session.add(task)
    db_session.commit()
    headers = {**auth_headers, "Idempotency-Key": "retry"}
    path = f"/api/tasks/{task.id}/status"
    payload = {"status": "IN_PROGRESS", "expected_version": 1}
    first = client.patch(path, headers=headers, json=payload)
    assert first.status_code == 200, first.text
    assert client.patch(path, headers=headers, json=payload).json() == first.json()
    conflict = client.patch(
        path, headers=auth_headers, json={"status": "NEW", "expected_version": 1}
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["current_version"] == 2
    assert db_session.query(CommentModel).count() == 1


def test_outbox_rolls_back_with_transaction(db_session):
    outbox_service.stage_event(db_session, "notification", {"user_id": 1})
    db_session.flush()
    db_session.rollback()
    assert db_session.query(OutboxEventModel).count() == 0


def test_outbox_lease_retry_and_restart(db_session, monkeypatch):
    factory = sessionmaker(bind=db_session.get_bind())
    row = outbox_service.stage_event(db_session, "notification", {"event": "test"})
    db_session.commit()
    claimed = outbox_service.claim_events(factory)
    assert len(claimed) == 1
    assert outbox_service.claim_events(factory) == []
    event_id, token, *_ = claimed[0]
    outbox_service.finish_event(event_id, "wrong-token", session_factory=factory)
    assert outbox_service.claim_events(factory) == []
    outbox_service.finish_event(event_id, token, RuntimeError("temporary"), factory)
    db_session.expire_all()
    assert row.attempts == 1
    assert row.delivered_at is None
    row.available_at = outbox_service.now_utc() - timedelta(seconds=1)
    db_session.commit()
    received = []

    async def deliver(kind, payload):
        received.append((kind, payload))

    monkeypatch.setattr(outbox_service, "dispatch_event", deliver)
    asyncio.run(outbox_service.drain_outbox(factory))
    db_session.expire_all()
    assert row.delivered_at is not None
    assert len(received) == 1
    asyncio.run(outbox_service.drain_outbox(factory))
    assert len(received) == 1


def test_comment_does_not_create_false_status_conflict(
    client, auth_headers, db_session
):
    task = TaskModel(title="Работа", raw_address="Ленина, 1", status="NEW")
    db_session.add(task)
    db_session.commit()
    assert (
        client.post(
            f"/api/tasks/{task.id}/comments",
            headers=auth_headers,
            json={"text": "Комментарий перед сменой статуса"},
        ).status_code
        == 200
    )
    response = client.patch(
        f"/api/tasks/{task.id}/status",
        headers=auth_headers,
        json={"status": "IN_PROGRESS", "expected_version": 1},
    )
    assert response.status_code == 200, response.text
