"""
Tests for Intercom Panels API
=============================
Тесты CRUD для сетевых домофонных панелей на адресе.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AddressModel, IntercomPanelModel


@pytest.fixture
def address(db_session: Session) -> AddressModel:
    """Создаём тестовый адрес."""
    address = AddressModel(address="Панельная ул., 5")
    db_session.add(address)
    db_session.commit()
    db_session.refresh(address)
    return address


class TestIntercomPanelsCRUD:
    """Тесты CRUD для панелей."""

    def test_create_panel(
        self, client: TestClient, address: AddressModel, auth_headers: dict
    ):
        """Создание панели с дефолтами vendor/port/is_active."""
        data = {
            "ip": "10.80.80.222",
            "model": "DKS15198",
            "label": "Подъезд 4",
            "entrance": "4",
        }
        response = client.post(
            f"/api/addresses/{address.id}/panels", json=data, headers=auth_headers
        )

        assert response.status_code == 201
        result = response.json()
        assert result["ip"] == "10.80.80.222"
        assert result["entrance"] == "4"
        assert result["vendor"] == "beward"
        assert result["port"] == 80
        assert result["is_active"] is True
        assert result["address_id"] == address.id

    def test_get_panels_sorted(
        self,
        client: TestClient,
        address: AddressModel,
        db_session: Session,
        auth_headers: dict,
    ):
        """Список панелей сортируется по подъезду."""
        db_session.add_all(
            [
                IntercomPanelModel(address_id=address.id, ip="10.0.0.2", entrance="2"),
                IntercomPanelModel(address_id=address.id, ip="10.0.0.1", entrance="1"),
            ]
        )
        db_session.commit()

        response = client.get(
            f"/api/addresses/{address.id}/panels", headers=auth_headers
        )
        assert response.status_code == 200
        panels = response.json()
        assert len(panels) == 2
        assert [p["entrance"] for p in panels] == ["1", "2"]

    def test_update_panel(
        self,
        client: TestClient,
        address: AddressModel,
        db_session: Session,
        auth_headers: dict,
    ):
        """Частичное обновление панели."""
        panel = IntercomPanelModel(address_id=address.id, ip="10.0.0.9", label="старое")
        db_session.add(panel)
        db_session.commit()
        db_session.refresh(panel)

        response = client.patch(
            f"/api/addresses/{address.id}/panels/{panel.id}",
            json={"label": "новое", "is_active": False},
            headers=auth_headers,
        )
        assert response.status_code == 200
        result = response.json()
        assert result["label"] == "новое"
        assert result["is_active"] is False
        assert result["ip"] == "10.0.0.9"  # не тронуто

    def test_delete_panel(
        self,
        client: TestClient,
        address: AddressModel,
        db_session: Session,
        auth_headers: dict,
    ):
        """Удаление панели."""
        panel = IntercomPanelModel(address_id=address.id, ip="10.0.0.7")
        db_session.add(panel)
        db_session.commit()
        db_session.refresh(panel)
        panel_id = panel.id

        response = client.delete(
            f"/api/addresses/{address.id}/panels/{panel_id}", headers=auth_headers
        )
        assert response.status_code == 204

        assert (
            db_session.query(IntercomPanelModel)
            .filter(IntercomPanelModel.id == panel_id)
            .first()
            is None
        )

    def test_update_missing_panel_404(
        self, client: TestClient, address: AddressModel, auth_headers: dict
    ):
        """404 при обновлении несуществующей панели."""
        response = client.patch(
            f"/api/addresses/{address.id}/panels/99999",
            json={"label": "x"},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_panels_in_full_card(
        self,
        client: TestClient,
        address: AddressModel,
        db_session: Session,
        auth_headers: dict,
    ):
        """Панели попадают в полную карточку объекта."""
        db_session.add(
            IntercomPanelModel(
                address_id=address.id, ip="10.80.80.222", label="Главный вход"
            )
        )
        db_session.commit()

        response = client.get(f"/api/addresses/{address.id}/full", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "panels" in data
        assert len(data["panels"]) == 1
        assert data["panels"][0]["label"] == "Главный вход"

    def test_delete_address_cascades_panels(
        self,
        client: TestClient,
        address: AddressModel,
        db_session: Session,
        auth_headers: dict,
    ):
        """Удаление адреса каскадно удаляет панели."""
        panel = IntercomPanelModel(address_id=address.id, ip="10.0.0.3")
        db_session.add(panel)
        db_session.commit()
        panel_id = panel.id

        db_session.delete(address)
        db_session.commit()

        assert (
            db_session.query(IntercomPanelModel)
            .filter(IntercomPanelModel.id == panel_id)
            .first()
            is None
        )
