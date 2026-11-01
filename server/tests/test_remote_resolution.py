"""Удалённое решение из карточки заявки: панели адреса, действия в истории
заявки, кадр в фото, «Решено удалённо» одной транзакцией."""

from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import settings
from app.models import (
    AddressModel,
    CommentModel,
    IntercomActionModel,
    IntercomPanelModel,
    TaskModel,
    TaskStatus,
)
from app.services import beward
from tests.test_acts import _org


@pytest.fixture
def site(client: TestClient, db_session):
    """Организация, заявка мастера на адресе с двумя панелями (одна выключена)."""
    ctx = _org(client, db_session, "RemoteOrg")
    address = AddressModel(address="ул. Невская, д. 9", organization_id=ctx.org.id)
    db_session.add(address)
    db_session.commit()
    panel = IntercomPanelModel(
        address_id=address.id, ip="10.80.80.222", label="Подъезд 1", entrance="1"
    )
    db_session.add_all(
        [
            panel,
            IntercomPanelModel(
                address_id=address.id, ip="10.80.80.223", is_active=False
            ),
        ]
    )
    ctx.task.address_id = address.id
    db_session.commit()
    ctx.address, ctx.panel = address, panel
    return ctx


@pytest.fixture
def device(monkeypatch):
    """Панель отвечает: дверь открывается, код ключей 55787."""

    async def ok(host, port):
        return None

    async def lock(host, port):
        return True

    async def scan_code(host, port):
        return "55787", True

    monkeypatch.setattr(beward, "open_door", ok)
    monkeypatch.setattr(beward, "close_door", ok)
    monkeypatch.setattr(beward, "get_lock_status", lock)
    monkeypatch.setattr(beward, "get_mifare_scan_code", scan_code)


def _history(db_session, task_id) -> list:
    db_session.expire_all()
    return [
        c.text
        for c in db_session.query(CommentModel)
        .filter_by(task_id=task_id)
        .order_by(CommentModel.id)
    ]


def _door(client, site, headers, task_id=None):
    url = f"/api/addresses/{site.address.id}/panels/{site.panel.id}/door/open"
    params = {"task_id": task_id} if task_id is not None else None
    return client.post(url, params=params, headers=headers)


class TestTaskPanels:
    def test_assignee_of_open_task_controls_the_panel(
        self, client: TestClient, db_session, site, device
    ):
        panels = client.get(
            f"/api/tasks/{site.task.id}/panels", headers=site.worker.headers
        )

        assert panels.status_code == 200
        assert [p["label"] for p in panels.json()] == ["Подъезд 1"]
        assert "ip" not in panels.json()[0]  # сетевые реквизиты не нужны мастеру
        # Мастер не отвечает за адрес, но у него открытая заявка на нём
        assert _door(client, site, site.worker.headers).status_code == 200

        site.task.status = TaskStatus.DONE.value
        db_session.commit()
        closed = client.get(
            f"/api/tasks/{site.task.id}/panels", headers=site.worker.headers
        )
        assert closed.json() == []
        assert _door(client, site, site.worker.headers).status_code == 403

    def test_door_from_task_card_goes_to_history(
        self, client: TestClient, db_session, site, device, monkeypatch
    ):
        opened = _door(client, site, site.worker.headers, site.task.id)
        assert opened.status_code == 200, opened.text

        async def unreachable(host, port):
            raise beward.BewardUnreachable("timeout")

        monkeypatch.setattr(beward, "open_door", unreachable)
        failed = _door(client, site, site.worker.headers, site.task.id)
        assert failed.status_code == 504

        history = _history(db_session, site.task.id)
        assert "Дверь открыта удалённо · Подъезд 1 · успешно" in history
        assert (
            "Дверь открыта удалённо · Подъезд 1 · не удалось: панель недоступна"
            in history
        )
        actions = db_session.query(IntercomActionModel).filter_by(task_id=site.task.id)
        assert sorted(a.success for a in actions) == [False, True]

    def test_task_from_another_address_is_rejected(
        self, client: TestClient, db_session, site, device
    ):
        other = TaskModel(
            title="Садовая 1",
            raw_address="ул. Садовая, д. 1",
            description="",
            status=TaskStatus.NEW.value,
            organization_id=site.org.id,
            assigned_user_id=site.worker.user.id,
        )
        db_session.add(other)
        db_session.commit()

        response = _door(client, site, site.worker.headers, other.id)

        assert response.status_code == 400
        assert db_session.query(IntercomActionModel).count() == 0

    def test_key_code_request_noted_without_the_code(
        self, client: TestClient, db_session, site, device
    ):
        response = client.get(
            f"/api/addresses/{site.address.id}/panels/{site.panel.id}"
            "/mifare-scan-code",
            params={"task_id": site.task.id},
            headers=site.worker.headers,
        )

        assert response.json()["code"] == "55787"
        history = _history(db_session, site.task.id)
        assert "Запрошен код записи ключей · Подъезд 1 · успешно" in history
        assert not any("55787" in text for text in history)

    def test_snapshot_becomes_task_photo(
        self, client: TestClient, db_session, site, monkeypatch
    ):
        frame = BytesIO()
        Image.new("RGB", (640, 360), "#334155").save(frame, format="JPEG")

        async def snapshot(host, port):
            return frame.getvalue()

        monkeypatch.setattr(beward, "get_snapshot", snapshot)
        response = client.post(
            f"/api/tasks/{site.task.id}/panels/{site.panel.id}/snapshot-photo",
            headers=site.worker.headers,
        )

        assert response.status_code == 200, response.text
        photo = response.json()
        assert photo["photo_type"] == "after"
        (settings.PHOTOS_DIR / photo["filename"]).unlink(missing_ok=True)


class TestResolveRemotely:
    def test_dispatcher_closes_unassigned_task_in_one_go(
        self, client: TestClient, db_session, site
    ):
        site.task.status = TaskStatus.NEW.value
        site.task.assigned_user_id = None
        db_session.commit()
        url = f"/api/tasks/{site.task.id}/resolve-remotely"
        headers = {**site.dispatcher.headers, "Idempotency-Key": "resolve-1"}
        body = {"comment": "Открыли дверь, жилец зашёл"}

        first = client.post(url, json=body, headers=headers)
        repeat = client.post(url, json=body, headers=headers)

        assert first.status_code == 200, first.text
        task = first.json()
        assert (task["status"], task["is_remote"]) == ("DONE", True)
        assert task["assigned_user_id"] == site.dispatcher.user.id
        assert repeat.json() == task
        history = _history(db_session, site.task.id)
        assert history[0].startswith("Назначение изменено: Не назначен →")
        assert history[-1] == "Решено удалённо: Открыли дверь, жилец зашёл"
        assert len(history) == 3  # назначение, взята в работу, выполнена

    def test_rules(self, client: TestClient, db_session, site):
        url = f"/api/tasks/{site.task.id}/resolve-remotely"

        assert (
            client.post(url, json={"comment": "ок"}, headers=site.worker.headers)
        ).status_code == 422
        stale = client.post(
            url,
            json={"comment": "Выдали код ключей", "expected_version": 999},
            headers=site.worker.headers,
        )
        assert stale.status_code == 409

        done = client.post(
            url, json={"comment": "Выдали код ключей"}, headers=site.worker.headers
        )
        assert done.status_code == 200
        assert done.json()["assigned_user_id"] == site.worker.user.id
        # Была «в работе» — один переход, без лишнего назначения
        assert _history(db_session, site.task.id) == [
            "Решено удалённо: Выдали код ключей"
        ]

        again = client.post(
            url, json={"comment": "Выдали код ключей"}, headers=site.worker.headers
        )
        assert again.status_code == 409
