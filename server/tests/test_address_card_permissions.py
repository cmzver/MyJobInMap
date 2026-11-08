"""
Права на карточку объекта
=========================
Системы, оборудование, домофонные панели, документы и контакты меняют только
диспетчер и администратор (включая кастомные группы с base_access=dispatcher).
Мастер — только чтение; открыть дверь панели ему по-прежнему можно.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    AddressAssigneeModel,
    AddressContactModel,
    AddressDocumentModel,
    AddressEquipmentModel,
    AddressModel,
    AddressSystemModel,
    IntercomPanelModel,
)
from app.models.settings import UserGroupModel
from app.models.user import UserModel
from app.services.auth import get_password_hash

FORBIDDEN_TEXT = "Нужны права диспетчера или администратора"


@pytest.fixture
def card(db_session: Session) -> dict:
    """Адрес со всеми видами записей карточки."""
    address = AddressModel(address="Правовая ул., 7", city="Тест")
    db_session.add(address)
    db_session.commit()
    db_session.refresh(address)
    system = AddressSystemModel(
        address_id=address.id, system_type="intercom", name="Домофон"
    )
    equipment = AddressEquipmentModel(
        address_id=address.id, equipment_type="intercom_panel", name="Панель"
    )
    panel = IntercomPanelModel(address_id=address.id, ip="10.0.0.5", entrance="1")
    contact = AddressContactModel(address_id=address.id, name="Иван")
    document = AddressDocumentModel(
        address_id=address.id,
        name="Договор",
        doc_type="other",
        file_path="nonexistent.pdf",
    )
    db_session.add_all([system, equipment, panel, contact, document])
    db_session.commit()
    return {
        "address": address.id,
        "system": system.id,
        "equipment": equipment.id,
        "panel": panel.id,
        "contact": contact.id,
        "document": document.id,
    }


def _write_requests(ids: dict) -> list[tuple[str, str, dict]]:
    a = ids["address"]
    return [
        ("POST", f"/api/addresses/{a}/systems", {"system_type": "other", "name": "X"}),
        ("PATCH", f"/api/addresses/{a}/systems/{ids['system']}", {"name": "Y"}),
        ("DELETE", f"/api/addresses/{a}/systems/{ids['system']}", {}),
        (
            "POST",
            f"/api/addresses/{a}/equipment",
            {"equipment_type": "other", "name": "X"},
        ),
        ("PATCH", f"/api/addresses/{a}/equipment/{ids['equipment']}", {"name": "Y"}),
        ("DELETE", f"/api/addresses/{a}/equipment/{ids['equipment']}", {}),
        ("POST", f"/api/addresses/{a}/panels", {"ip": "10.0.0.6", "port": 8080}),
        ("PATCH", f"/api/addresses/{a}/panels/{ids['panel']}", {"port": 81}),
        ("DELETE", f"/api/addresses/{a}/panels/{ids['panel']}", {}),
        ("POST", f"/api/addresses/{a}/contacts", {"name": "Пётр"}),
        ("PATCH", f"/api/addresses/{a}/contacts/{ids['contact']}", {"name": "Y"}),
        ("DELETE", f"/api/addresses/{a}/contacts/{ids['contact']}", {}),
        ("DELETE", f"/api/addresses/{a}/documents/{ids['document']}", {}),
        ("POST", f"/api/addresses/{a}/deactivate", {}),
    ]


def _send(client: TestClient, method: str, url: str, body: dict):
    if method == "DELETE":
        return client.delete(url)
    return client.request(method, url, json=body or None)


def test_worker_cannot_modify_card(client_with_worker: TestClient, card: dict):
    for method, url, body in _write_requests(card):
        response = _send(client_with_worker, method, url, body)
        assert response.status_code == 403, (method, url, response.text)
        assert response.json()["detail"] == FORBIDDEN_TEXT


def test_worker_cannot_upload_document(client_with_worker: TestClient, card: dict):
    response = client_with_worker.post(
        f"/api/addresses/{card['address']}/documents",
        data={"name": "Акт"},
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == FORBIDDEN_TEXT


def test_worker_can_read_card(client_with_worker: TestClient, card: dict):
    a = card["address"]
    for url in (
        f"/api/addresses/{a}/full",
        f"/api/addresses/{a}/systems",
        f"/api/addresses/{a}/equipment",
        f"/api/addresses/{a}/panels",
        f"/api/addresses/{a}/contacts",
        f"/api/addresses/{a}/documents",
    ):
        assert client_with_worker.get(url).status_code == 200, url


def test_worker_can_still_open_door(
    client_with_worker: TestClient,
    db_session: Session,
    worker_user: UserModel,
    card: dict,
    monkeypatch,
):
    """Открытие двери — не правка карточки, ответственному мастеру оставлено."""
    from app.services import beward

    async def fake_door(*args, **kwargs):
        return None

    async def fake_status(*args, **kwargs):
        return True

    monkeypatch.setattr(beward, "open_door", fake_door)
    monkeypatch.setattr(beward, "get_lock_status", fake_status)
    db_session.add(
        AddressAssigneeModel(address_id=card["address"], user_id=worker_user.id)
    )
    db_session.commit()

    response = client_with_worker.post(
        f"/api/addresses/{card['address']}/panels/{card['panel']}/door/open"
    )
    assert response.status_code == 200, response.text
    assert response.json()["ok"] is True


def test_dispatcher_can_modify_card(client_with_dispatcher: TestClient, card: dict):
    for method, url, body in _write_requests(card):
        response = _send(client_with_dispatcher, method, url, body)
        assert response.status_code in (200, 201, 204), (method, url, response.text)


def test_custom_dispatcher_group_can_modify(
    client: TestClient, db_session: Session, card: dict
):
    db_session.add(
        UserGroupModel(
            name="senior",
            label="Старший мастер",
            base_access="dispatcher",
            is_system=False,
        )
    )
    db_session.add(
        UserModel(
            username="senior",
            password_hash=get_password_hash("senior"),
            full_name="Senior",
            role="senior",
            is_active=True,
        )
    )
    db_session.commit()
    token = client.post(
        "/api/auth/login", data={"username": "senior", "password": "senior"}
    ).json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})

    response = client.post(
        f"/api/addresses/{card['address']}/contacts", json={"name": "Пётр"}
    )
    assert response.status_code == 201, response.text
