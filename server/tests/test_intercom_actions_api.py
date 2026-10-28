"""
Tests for Intercom Panel Actions API
====================================
Юнит-тесты парсеров драйвера Beward и эндпоинтов управления панелью
(с замоканным драйвером — без реального устройства).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AddressModel, IntercomActionModel, IntercomPanelModel
from app.services import beward

# ============================================
# Pure parser unit tests
# ============================================


class TestBewardParsers:
    def test_parse_lock_open_true(self):
        assert beward.parse_lock_open("a bopendoorson.value='1' b") is True

    def test_parse_lock_open_false(self):
        assert beward.parse_lock_open("bopendoorson.value=0") is False

    def test_parse_lock_open_missing(self):
        assert beward.parse_lock_open("no flag here") is False

    def test_parse_mifare_scan(self):
        html = "document.outcfg_frm.regcode.value=55787;ckregactive.checked=1;"
        code, active = beward.parse_mifare_scan(html)
        assert code == "55787"
        assert active is True

    def test_parse_mifare_scan_inactive(self):
        code, active = beward.parse_mifare_scan(
            "regcode.value=12345;ckregactive.checked=0"
        )
        assert code == "12345"
        assert active is False


# ============================================
# Endpoint tests (driver mocked)
# ============================================


@pytest.fixture
def panel(db_session: Session) -> IntercomPanelModel:
    address = AddressModel(address="Замковая ул., 1")
    db_session.add(address)
    db_session.commit()
    db_session.refresh(address)
    panel = IntercomPanelModel(address_id=address.id, ip="10.80.80.222", label="Тест")
    db_session.add(panel)
    db_session.commit()
    db_session.refresh(panel)
    return panel


def _base(panel: IntercomPanelModel) -> str:
    return f"/api/addresses/{panel.address_id}/panels/{panel.id}"


class TestDoorActions:
    def test_open_door_success_and_audit(
        self,
        client: TestClient,
        panel: IntercomPanelModel,
        db_session: Session,
        auth_headers: dict,
        monkeypatch,
    ):
        async def fake_open(host, port):
            return None

        async def fake_status(host, port):
            return True

        monkeypatch.setattr(beward, "open_door", fake_open)
        monkeypatch.setattr(beward, "get_lock_status", fake_status)

        resp = client.post(f"{_base(panel)}/door/open", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["action"] == "open"
        assert data["is_open"] is True

        actions = (
            db_session.query(IntercomActionModel)
            .filter(IntercomActionModel.panel_id == panel.id)
            .all()
        )
        assert len(actions) == 1
        assert actions[0].action == "open"
        assert actions[0].success is True

    def test_close_door_success(
        self,
        client: TestClient,
        panel: IntercomPanelModel,
        auth_headers: dict,
        monkeypatch,
    ):
        async def fake_close(host, port):
            return None

        async def fake_status(host, port):
            return False

        monkeypatch.setattr(beward, "close_door", fake_close)
        monkeypatch.setattr(beward, "get_lock_status", fake_status)

        resp = client.post(f"{_base(panel)}/door/close", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["is_open"] is False

    def test_open_door_unreachable_504_and_audit_failure(
        self,
        client: TestClient,
        panel: IntercomPanelModel,
        db_session: Session,
        auth_headers: dict,
        monkeypatch,
    ):
        async def fake_open(host, port):
            raise beward.BewardUnreachable("timeout")

        monkeypatch.setattr(beward, "open_door", fake_open)

        resp = client.post(f"{_base(panel)}/door/open", headers=auth_headers)
        assert resp.status_code == 504

        action = (
            db_session.query(IntercomActionModel)
            .filter(IntercomActionModel.panel_id == panel.id)
            .first()
        )
        assert action is not None
        assert action.success is False
        assert action.action == "open"


class TestReadActions:
    def test_lock_status(
        self,
        client: TestClient,
        panel: IntercomPanelModel,
        auth_headers: dict,
        monkeypatch,
    ):
        async def fake_status(host, port):
            return True

        monkeypatch.setattr(beward, "get_lock_status", fake_status)
        resp = client.get(f"{_base(panel)}/lock-status", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["is_open"] is True

    def test_mifare_scan_code(
        self,
        client: TestClient,
        panel: IntercomPanelModel,
        auth_headers: dict,
        monkeypatch,
    ):
        async def fake_scan(host, port):
            return ("55787", True)

        monkeypatch.setattr(beward, "get_mifare_scan_code", fake_scan)
        resp = client.get(f"{_base(panel)}/mifare-scan-code", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == "55787"
        assert data["active"] is True

    def test_snapshot(
        self,
        client: TestClient,
        panel: IntercomPanelModel,
        auth_headers: dict,
        monkeypatch,
    ):
        jpeg = b"\xff\xd8\xff\xe0fakejpegdata"

        async def fake_snap(host, port):
            return jpeg

        monkeypatch.setattr(beward, "get_snapshot", fake_snap)
        resp = client.get(f"{_base(panel)}/snapshot", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/jpeg"
        assert resp.content == jpeg

    def test_panel_not_found(
        self, client: TestClient, panel: IntercomPanelModel, auth_headers: dict
    ):
        resp = client.get(
            f"/api/addresses/{panel.address_id}/panels/99999/lock-status",
            headers=auth_headers,
        )
        assert resp.status_code == 404
