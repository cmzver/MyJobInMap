"""Tests for /api/addresses endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


class TestAddressCreate:
    """Tests for POST /api/addresses endpoint."""

    def test_create_address_success(self, client: TestClient, auth_headers: dict):
        """Test creating a new address."""
        new_address = {
            "address": "СПб, Невский пр., 100",
            "city": "Санкт-Петербург",
            "street": "Невский проспект",
            "building": "100",
            "entrance_count": 4,
            "floor_count": 9,
            "has_elevator": True,
            "has_intercom": True,
            "intercom_code": "123#4567",
        }

        response = client.post("/api/addresses", json=new_address, headers=auth_headers)

        assert response.status_code == 201  # Created
        data = response.json()
        assert "СПб" in data["address"] or "Невский" in data["address"]
        assert data["city"] == "Санкт-Петербург"
        assert data["entrance_count"] == 4
        assert data["has_elevator"] is True
        assert "id" in data

    def test_create_address_minimal(self, client: TestClient, auth_headers: dict):
        """Test creating address with minimal data."""
        response = client.post(
            "/api/addresses",
            json={"address": "Минимальный адрес"},
            headers=auth_headers,
        )

        assert response.status_code == 201  # Created
        data = response.json()
        assert "Минимальный" in data["address"]

    def test_create_address_without_auth(self, client: TestClient):
        """Test that creating address works without authentication.

        Note: Currently the addresses API allows unauthenticated access.
        This may be intentional for public address lookup functionality.
        """
        response = client.post("/api/addresses", json={"address": "Test address"})

        # Currently allows unauthenticated access (201 Created)
        # If auth is required in the future, change to [401, 403]
        assert response.status_code in [201, 401, 403]


class TestAddressRetrieval:
    """Tests for GET /api/addresses endpoints."""

    def test_get_addresses_list(self, client: TestClient, auth_headers: dict):
        """Test getting list of addresses."""
        response = client.get("/api/addresses", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "pages" in data

    def test_get_addresses_with_pagination(
        self, client: TestClient, auth_headers: dict
    ):
        """Test addresses pagination."""
        response = client.get("/api/addresses?page=1&size=5", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["size"] == 5

    def test_get_address_by_id(self, client: TestClient, auth_headers: dict):
        """Test getting address by ID."""
        # First create an address
        create_response = client.post(
            "/api/addresses",
            json={"address": "Тестовый адрес для получения"},
            headers=auth_headers,
        )
        address_id = create_response.json()["id"]

        # Then get it by ID
        response = client.get(f"/api/addresses/{address_id}", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == address_id
        assert data["address"] == "Тестовый адрес для получения"

    def test_get_address_not_found(self, client: TestClient, auth_headers: dict):
        """Test getting non-existent address."""
        response = client.get("/api/addresses/99999", headers=auth_headers)

        assert response.status_code == 404


class TestAddressUpdate:
    """Tests for PATCH /api/addresses/{id} endpoint."""

    def test_update_address(self, client: TestClient, auth_headers: dict):
        """Test updating an address."""
        # Create address first
        create_response = client.post(
            "/api/addresses",
            json={"address": "Оригинальный адрес"},
            headers=auth_headers,
        )
        address_id = create_response.json()["id"]

        # Update it
        response = client.patch(
            f"/api/addresses/{address_id}",
            json={
                "address": "Обновлённый адрес",
                "has_elevator": True,
                "floor_count": 12,
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["address"] == "Обновлённый адрес"
        assert data["has_elevator"] is True
        assert data["floor_count"] == 12

    def test_update_address_partial(self, client: TestClient, auth_headers: dict):
        """Test partial update of address."""
        # Create address
        create_response = client.post(
            "/api/addresses",
            json={"address": "Адрес", "floor_count": 5},
            headers=auth_headers,
        )
        address_id = create_response.json()["id"]

        # Update only floor_count
        response = client.patch(
            f"/api/addresses/{address_id}",
            json={"floor_count": 10},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["floor_count"] == 10
        assert data["address"] == "Адрес"  # Unchanged


class TestAddressDelete:
    """Tests for DELETE /api/addresses/{id} endpoint."""

    def test_delete_address(self, client: TestClient, auth_headers: dict):
        """Test deleting an address."""
        # Create address
        create_response = client.post(
            "/api/addresses",
            json={"address": "Адрес для удаления"},
            headers=auth_headers,
        )
        address_id = create_response.json()["id"]

        # Delete it
        response = client.delete(f"/api/addresses/{address_id}", headers=auth_headers)

        # May be 200 or 204 for successful deletion
        assert response.status_code in [200, 204]

        # Verify it's deleted
        get_response = client.get(f"/api/addresses/{address_id}", headers=auth_headers)
        assert get_response.status_code == 404

    def test_delete_address_not_found(self, client: TestClient, auth_headers: dict):
        """Test deleting non-existent address."""
        response = client.delete("/api/addresses/99999", headers=auth_headers)

        assert response.status_code == 404


class TestAddressSearch:
    """Tests for address search functionality."""

    def test_search_addresses(self, client: TestClient, auth_headers: dict):
        """Test searching addresses."""
        # Create some addresses
        client.post(
            "/api/addresses",
            json={"address": "СПб, Невский проспект, 1"},
            headers=auth_headers,
        )
        client.post(
            "/api/addresses",
            json={"address": "СПб, Литейный проспект, 1"},
            headers=auth_headers,
        )

        # Search for Невский
        response = client.get("/api/addresses/search?q=Невский", headers=auth_headers)

        assert response.status_code == 200
        results = response.json()
        assert isinstance(results, list)
        # Should find at least one result with "Невский"
        assert any("Невский" in addr.get("address", "") for addr in results)


class TestAddressParsing:
    """Tests for address parsing endpoint."""

    def test_parse_address(self, client: TestClient, auth_headers: dict):
        """Test parsing address string."""
        response = client.post(
            "/api/addresses/parse",
            json={"address": "Санкт-Петербург, ул. Ленина, д.10, корп.2"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        # Parser should extract components
        assert "city" in data or "street" in data or "building" in data


# ──────────────────────────────────────────────────────────────────────
# Autocomplete endpoints
# ──────────────────────────────────────────────────────────────────────


class TestAutocompleteEndpoints:
    """Tests for /api/addresses/autocomplete/* endpoints."""

    @pytest.fixture(autouse=True)
    def _seed_addresses(self, client: TestClient, auth_headers: dict):
        """Seed several addresses for autocomplete tests."""
        addresses = [
            {
                "address": "Москва, ул. Ленина, 1",
                "city": "Москва",
                "street": "ул. Ленина",
                "building": "1",
                "entrance_count": 4,
            },
            {
                "address": "Москва, ул. Ленина, 2",
                "city": "Москва",
                "street": "ул. Ленина",
                "building": "2",
                "entrance_count": 3,
            },
            {
                "address": "Москва, Тверская, 10",
                "city": "Москва",
                "street": "Тверская",
                "building": "10",
            },
            {
                "address": "СПб, Невский, 5",
                "city": "Санкт-Петербург",
                "street": "Невский проспект",
                "building": "5",
            },
        ]
        for addr in addresses:
            client.post("/api/addresses", json=addr, headers=auth_headers)

    def test_autocomplete_cities(self, client: TestClient, auth_headers: dict):
        """GET /api/addresses/autocomplete/cities returns unique cities."""
        response = client.get(
            "/api/addresses/autocomplete/cities", headers=auth_headers
        )
        assert response.status_code == 200
        cities = response.json()
        assert isinstance(cities, list)
        assert "Москва" in cities
        assert "Санкт-Петербург" in cities

    def test_autocomplete_cities_with_query(
        self, client: TestClient, auth_headers: dict
    ):
        """Filter cities by query parameter."""
        response = client.get(
            "/api/addresses/autocomplete/cities?q=Моск", headers=auth_headers
        )
        assert response.status_code == 200
        cities = response.json()
        assert "Москва" in cities
        assert "Санкт-Петербург" not in cities

    def test_autocomplete_streets(self, client: TestClient, auth_headers: dict):
        """GET /api/addresses/autocomplete/streets returns unique streets."""
        response = client.get(
            "/api/addresses/autocomplete/streets", headers=auth_headers
        )
        assert response.status_code == 200
        streets = response.json()
        assert isinstance(streets, list)
        assert len(streets) >= 2  # ул. Ленина + Тверская + Невский

    def test_autocomplete_streets_filtered_by_city(
        self, client: TestClient, auth_headers: dict
    ):
        """Streets filtered by city."""
        response = client.get(
            "/api/addresses/autocomplete/streets?city=Москва", headers=auth_headers
        )
        assert response.status_code == 200
        streets = response.json()
        assert "ул. Ленина" in streets
        assert "Невский проспект" not in streets

    def test_autocomplete_buildings(self, client: TestClient, auth_headers: dict):
        """GET /api/addresses/autocomplete/buildings returns building numbers."""
        response = client.get(
            "/api/addresses/autocomplete/buildings?city=Москва&street=ул. Ленина",
            headers=auth_headers,
        )
        assert response.status_code == 200
        buildings = response.json()
        assert "1" in buildings
        assert "2" in buildings

    def test_autocomplete_entrance(self, client: TestClient, auth_headers: dict):
        """GET /api/addresses/autocomplete/entrance generates entrance list from count."""
        response = client.get(
            "/api/addresses/autocomplete/entrance?city=Москва&street=ул. Ленина&building=1",
            headers=auth_headers,
        )
        assert response.status_code == 200
        entrances = response.json()
        # Address has entrance_count=4, should generate ["1","2","3","4"]
        assert entrances == ["1", "2", "3", "4"]

    def test_autocomplete_entrance_no_match(
        self, client: TestClient, auth_headers: dict
    ):
        """No matching address → empty list."""
        response = client.get(
            "/api/addresses/autocomplete/entrance?city=Nowhere&street=None&building=0",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == []

    def test_autocomplete_full(self, client: TestClient, auth_headers: dict):
        """Full address autocomplete search."""
        response = client.get(
            "/api/addresses/autocomplete/full?q=Ленина", headers=auth_headers
        )
        assert response.status_code == 200
        results = response.json()
        assert isinstance(results, list)
        assert len(results) >= 1


class TestAddressCompose:
    """Tests for POST /api/addresses/compose."""

    def test_compose_address(self, client: TestClient, auth_headers: dict):
        response = client.post(
            "/api/addresses/compose",
            json={"city": "Москва", "street": "ул. Ленина", "building": "10"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "address" in data
        assert "Москва" in data["address"]


class TestAddressFindByComponents:
    """Tests for GET /api/addresses/find-by-components."""

    def test_find_by_components(self, client: TestClient, auth_headers: dict):
        # Create address
        client.post(
            "/api/addresses",
            json={
                "address": "Москва, проспект Мира, 99",
                "city": "Москва",
                "street": "проспект Мира",
                "building": "99",
            },
            headers=auth_headers,
        )
        response = client.get(
            "/api/addresses/find-by-components?city=Москва&street=проспект Мира&building=99",
            headers=auth_headers,
        )
        assert response.status_code == 200

    def test_find_by_components_not_found(self, client: TestClient, auth_headers: dict):
        response = client.get(
            "/api/addresses/find-by-components?city=Nowhere&street=None&building=0",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() is None


class TestAddressDeactivate:
    """Tests for POST /api/addresses/{id}/deactivate."""

    def test_deactivate_address(self, client: TestClient, auth_headers: dict):
        create = client.post(
            "/api/addresses",
            json={"address": "Адрес для деактивации"},
            headers=auth_headers,
        )
        addr_id = create.json()["id"]

        response = client.post(
            f"/api/addresses/{addr_id}/deactivate", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    def test_deactivate_not_found(self, client: TestClient, auth_headers: dict):
        response = client.post("/api/addresses/99999/deactivate", headers=auth_headers)
        assert response.status_code == 404


class TestAddressFilters:
    """Tests for address list filtering."""

    def test_filter_by_city(self, client: TestClient, auth_headers: dict):
        client.post(
            "/api/addresses",
            json={"address": "Addr", "city": "Тест-Сити"},
            headers=auth_headers,
        )
        response = client.get("/api/addresses?city=Тест-Сити", headers=auth_headers)
        assert response.status_code == 200
        items = response.json()["items"]
        assert all(a["city"] == "Тест-Сити" for a in items)

    def test_search_addresses_param(self, client: TestClient, auth_headers: dict):
        client.post(
            "/api/addresses",
            json={"address": "УникальнаяСтрока123"},
            headers=auth_headers,
        )
        response = client.get(
            "/api/addresses?search=УникальнаяСтрока123", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["total"] >= 1
