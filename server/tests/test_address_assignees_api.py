"""
Tests for Address Assignees API + per-user access ("Мои адреса")
================================================================
Проверяем:
- GET /api/addresses/my отдаёт только назначенные адреса;
- назначение/снятие ответственных (admin/dispatcher);
- worker не может назначать;
- открытие двери: worker без привязки -> 403, с привязкой -> 200.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    AddressAssigneeModel,
    AddressModel,
    IntercomPanelModel,
)
from app.services import beward


@pytest.fixture
def two_addresses(db_session: Session):
    a1 = AddressModel(address="Назначенная ул., 1")
    a2 = AddressModel(address="Чужая ул., 2")
    db_session.add_all([a1, a2])
    db_session.commit()
    db_session.refresh(a1)
    db_session.refresh(a2)
    return a1, a2


class TestMyAddresses:
    def test_my_returns_only_assigned(
        self,
        client_with_worker: TestClient,
        db_session: Session,
        worker_user,
        two_addresses,
    ):
        a1, _a2 = two_addresses
        db_session.add(AddressAssigneeModel(address_id=a1.id, user_id=worker_user.id))
        db_session.commit()

        resp = client_with_worker.get("/api/addresses/my")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == a1.id

    def test_my_empty_when_nothing_assigned(
        self, client_with_worker: TestClient, two_addresses
    ):
        resp = client_with_worker.get("/api/addresses/my")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestAssigneeManagement:
    def test_admin_can_add_and_list_assignee(
        self,
        client: TestClient,
        auth_headers: dict,
        worker_user,
        two_addresses,
    ):
        a1, _ = two_addresses
        resp = client.post(
            f"/api/addresses/{a1.id}/assignees",
            json={"user_id": worker_user.id},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["user_id"] == worker_user.id
        assert body["full_name"] == worker_user.full_name

        listed = client.get(f"/api/addresses/{a1.id}/assignees", headers=auth_headers)
        assert listed.status_code == 200
        assert len(listed.json()) == 1

    def test_add_assignee_idempotent(
        self, client: TestClient, auth_headers: dict, worker_user, two_addresses
    ):
        a1, _ = two_addresses
        payload = {"user_id": worker_user.id}
        first = client.post(
            f"/api/addresses/{a1.id}/assignees", json=payload, headers=auth_headers
        )
        assert first.status_code == 201
        second = client.post(
            f"/api/addresses/{a1.id}/assignees", json=payload, headers=auth_headers
        )
        # Повторное назначение не плодит дубликатов.
        assert second.status_code == 201
        listed = client.get(f"/api/addresses/{a1.id}/assignees", headers=auth_headers)
        assert len(listed.json()) == 1

    def test_remove_assignee(
        self,
        client: TestClient,
        auth_headers: dict,
        db_session: Session,
        worker_user,
        two_addresses,
    ):
        a1, _ = two_addresses
        db_session.add(AddressAssigneeModel(address_id=a1.id, user_id=worker_user.id))
        db_session.commit()

        resp = client.delete(
            f"/api/addresses/{a1.id}/assignees/{worker_user.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 204
        remaining = (
            db_session.query(AddressAssigneeModel)
            .filter(AddressAssigneeModel.address_id == a1.id)
            .count()
        )
        assert remaining == 0

    def test_worker_cannot_add_assignee(
        self,
        client_with_worker: TestClient,
        worker_user,
        two_addresses,
    ):
        a1, _ = two_addresses
        resp = client_with_worker.post(
            f"/api/addresses/{a1.id}/assignees",
            json={"user_id": worker_user.id},
        )
        assert resp.status_code == 403


class TestDoorAccessGating:
    @pytest.fixture
    def panel_on(self, db_session: Session, two_addresses) -> IntercomPanelModel:
        a1, _ = two_addresses
        panel = IntercomPanelModel(address_id=a1.id, ip="10.80.80.10", label="P1")
        db_session.add(panel)
        db_session.commit()
        db_session.refresh(panel)
        return panel

    def test_worker_without_assignment_forbidden(
        self, client_with_worker: TestClient, panel_on: IntercomPanelModel
    ):
        resp = client_with_worker.post(
            f"/api/addresses/{panel_on.address_id}/panels/{panel_on.id}/door/open"
        )
        assert resp.status_code == 403

    def test_worker_with_assignment_can_open(
        self,
        client_with_worker: TestClient,
        db_session: Session,
        worker_user,
        panel_on: IntercomPanelModel,
        monkeypatch,
    ):
        db_session.add(
            AddressAssigneeModel(address_id=panel_on.address_id, user_id=worker_user.id)
        )
        db_session.commit()

        async def fake_open(host, port):
            return None

        async def fake_status(host, port):
            return True

        monkeypatch.setattr(beward, "open_door", fake_open)
        monkeypatch.setattr(beward, "get_lock_status", fake_status)

        resp = client_with_worker.post(
            f"/api/addresses/{panel_on.address_id}/panels/{panel_on.id}/door/open"
        )
        assert resp.status_code == 200
        assert resp.json()["is_open"] is True

    def test_admin_can_open_without_assignment(
        self,
        client: TestClient,
        auth_headers: dict,
        panel_on: IntercomPanelModel,
        monkeypatch,
    ):
        async def fake_open(host, port):
            return None

        async def fake_status(host, port):
            return True

        monkeypatch.setattr(beward, "open_door", fake_open)
        monkeypatch.setattr(beward, "get_lock_status", fake_status)

        resp = client.post(
            f"/api/addresses/{panel_on.address_id}/panels/{panel_on.id}/door/open",
            headers=auth_headers,
        )
        assert resp.status_code == 200
