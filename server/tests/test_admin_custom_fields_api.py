"""
Tests for /api/admin/custom-fields endpoints.
=============================================
Покрытие: CRUD кастомных полей, уникальность имени, toggle, права доступа.
"""

from fastapi.testclient import TestClient


def _create_field(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "name": "customer_phone",
        "label": "Телефон клиента",
        "field_type": "text",
        "is_required": True,
        "show_in_list": True,
        "show_in_card": True,
    }
    payload.update(overrides)
    response = client.post("/api/admin/custom-fields", headers=headers, json=payload)
    return response


class TestCustomFieldsCrud:
    """CRUD-цикл кастомного поля."""

    def test_list_empty(self, client: TestClient, auth_headers: dict):
        response = client.get("/api/admin/custom-fields", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    def test_create_field(self, client: TestClient, auth_headers: dict):
        response = _create_field(client, auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "customer_phone"
        assert data["label"] == "Телефон клиента"
        assert data["is_required"] is True
        assert data["is_active"] is True
        assert "id" in data

    def test_create_duplicate_name_rejected(
        self, client: TestClient, auth_headers: dict
    ):
        assert _create_field(client, auth_headers).status_code == 200
        dup = _create_field(client, auth_headers)
        assert dup.status_code == 400

    def test_create_select_with_options(self, client: TestClient, auth_headers: dict):
        response = _create_field(
            client,
            auth_headers,
            name="equipment_type",
            label="Тип оборудования",
            field_type="select",
            options=["Котёл", "Колонка"],
        )
        assert response.status_code == 200
        assert response.json()["options"] == ["Котёл", "Колонка"]

    def test_list_returns_created(self, client: TestClient, auth_headers: dict):
        _create_field(client, auth_headers)
        response = client.get("/api/admin/custom-fields", headers=auth_headers)
        assert response.status_code == 200
        names = [f["name"] for f in response.json()]
        assert "customer_phone" in names

    def test_update_field(self, client: TestClient, auth_headers: dict):
        field_id = _create_field(client, auth_headers).json()["id"]
        response = client.patch(
            f"/api/admin/custom-fields/{field_id}",
            headers=auth_headers,
            json={"label": "Контактный телефон", "is_required": False},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["label"] == "Контактный телефон"
        assert data["is_required"] is False
        # имя не меняется
        assert data["name"] == "customer_phone"

    def test_update_missing_field_404(self, client: TestClient, auth_headers: dict):
        response = client.patch(
            "/api/admin/custom-fields/99999",
            headers=auth_headers,
            json={"label": "x"},
        )
        assert response.status_code == 404

    def test_toggle_field(self, client: TestClient, auth_headers: dict):
        field_id = _create_field(client, auth_headers).json()["id"]
        first = client.patch(
            f"/api/admin/custom-fields/{field_id}/toggle", headers=auth_headers
        )
        assert first.status_code == 200
        assert first.json()["is_active"] is False
        second = client.patch(
            f"/api/admin/custom-fields/{field_id}/toggle", headers=auth_headers
        )
        assert second.json()["is_active"] is True

    def test_delete_field(self, client: TestClient, auth_headers: dict):
        field_id = _create_field(client, auth_headers).json()["id"]
        response = client.delete(
            f"/api/admin/custom-fields/{field_id}", headers=auth_headers
        )
        assert response.status_code == 200
        listing = client.get("/api/admin/custom-fields", headers=auth_headers)
        assert listing.json() == []

    def test_delete_missing_field_404(self, client: TestClient, auth_headers: dict):
        response = client.delete("/api/admin/custom-fields/99999", headers=auth_headers)
        assert response.status_code == 404


class TestCustomFieldsAuth:
    """Права доступа."""

    def test_list_requires_auth(self, client: TestClient):
        response = client.get("/api/admin/custom-fields")
        assert response.status_code in (401, 403)

    def test_create_worker_denied(self, client_with_worker: TestClient):
        response = client_with_worker.post(
            "/api/admin/custom-fields",
            json={"name": "x_field", "label": "X"},
        )
        assert response.status_code in (401, 403)
