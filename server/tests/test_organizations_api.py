"""Tests for Organizations API (multi-tenant)."""

import pytest


class TestOrganizationsAPI:
    """Tests for /api/admin/organizations endpoints."""

    def test_list_organizations_empty(self, client_with_auth):
        """Test listing organizations when none exist."""
        response = client_with_auth.get("/api/admin/organizations")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_organization(self, client_with_auth):
        """Test creating a new organization."""
        data = {
            "name": "Test Organization",
            "description": "Test org description",
            "email": "test@org.com",
            "phone": "+7 999 123 4567",
            "max_users": 100,
            "max_tasks": 5000,
        }
        response = client_with_auth.post("/api/admin/organizations", json=data)
        assert response.status_code == 201
        result = response.json()
        assert result["name"] == "Test Organization"
        assert result["slug"] == "test-organization"
        assert result["description"] == "Test org description"
        assert result["email"] == "test@org.com"
        assert result["is_active"] is True
        assert result["max_users"] == 100
        assert result["max_tasks"] == 5000
        assert result["user_count"] == 0
        assert result["task_count"] == 0

    def test_create_organization_auto_slug(self, client_with_auth):
        """Test that slug is auto-generated from name."""
        data = {"name": "Компания ООО «Тест»"}
        response = client_with_auth.post("/api/admin/organizations", json=data)
        assert response.status_code == 201
        result = response.json()
        assert result["name"] == "Компания ООО «Тест»"
        # slug should be generated (non-empty)
        assert len(result["slug"]) > 0

    def test_create_organization_minimal(self, client_with_auth):
        """Test creating organization with only required fields."""
        data = {"name": "Minimal Org"}
        response = client_with_auth.post("/api/admin/organizations", json=data)
        assert response.status_code == 201
        result = response.json()
        assert result["name"] == "Minimal Org"
        assert result["max_users"] == 50  # default
        assert result["max_tasks"] == 10000  # default

    def test_create_organization_with_initial_admin(self, client_with_auth):
        """Test creating organization together with its primary admin."""
        data = {
            "name": "Bootstrap Org",
            "initial_admin": {
                "username": "bootstrap_admin",
                "password": "secret123",
                "full_name": "Bootstrap Admin",
                "email": "bootstrap@example.com",
            },
        }
        response = client_with_auth.post("/api/admin/organizations", json=data)

        assert response.status_code == 201
        org_id = response.json()["id"]

        users_response = client_with_auth.get(
            f"/api/admin/organizations/{org_id}/users"
        )
        assert users_response.status_code == 200
        users = users_response.json()
        assert len(users) == 1
        assert users[0]["username"] == "bootstrap_admin"
        assert users[0]["role"] == "admin"
        assert users[0]["organization_id"] == org_id

    def test_create_organization_with_initial_admin_rejects_duplicate_username(
        self, client_with_auth, admin_user
    ):
        """Test organization creation fails if initial admin username already exists."""
        data = {
            "name": "Duplicate Admin Org",
            "initial_admin": {
                "username": admin_user.username,
                "password": "secret123",
            },
        }
        response = client_with_auth.post("/api/admin/organizations", json=data)

        assert response.status_code == 400

        list_response = client_with_auth.get("/api/admin/organizations")
        names = [org["name"] for org in list_response.json()]
        assert "Duplicate Admin Org" not in names

    def test_create_organization_duplicate_name(self, client_with_auth):
        """Test creating organizations with duplicate names."""
        data = {"name": "Unique Org"}
        response1 = client_with_auth.post("/api/admin/organizations", json=data)
        assert response1.status_code == 201

        response2 = client_with_auth.post("/api/admin/organizations", json=data)
        # Should fail or create with different slug
        assert response2.status_code in [400, 409, 201]

    def test_get_organization(self, client_with_auth):
        """Test getting a single organization."""
        # Create
        data = {"name": "Get Test Org"}
        create_resp = client_with_auth.post("/api/admin/organizations", json=data)
        assert create_resp.status_code == 201
        org_id = create_resp.json()["id"]

        # Get
        response = client_with_auth.get(f"/api/admin/organizations/{org_id}")
        assert response.status_code == 200
        assert response.json()["name"] == "Get Test Org"
        assert response.json()["id"] == org_id

    def test_get_organization_not_found(self, client_with_auth):
        """Test getting non-existent organization."""
        response = client_with_auth.get("/api/admin/organizations/99999")
        assert response.status_code == 404

    def test_update_organization(self, client_with_auth):
        """Test updating an organization."""
        # Create
        create_resp = client_with_auth.post(
            "/api/admin/organizations",
            json={"name": "Update Test Org"},
        )
        assert create_resp.status_code == 201
        org_id = create_resp.json()["id"]

        # Update
        update_data = {
            "name": "Updated Org Name",
            "description": "Updated description",
            "max_users": 200,
        }
        response = client_with_auth.patch(
            f"/api/admin/organizations/{org_id}", json=update_data
        )
        assert response.status_code == 200
        result = response.json()
        assert result["name"] == "Updated Org Name"
        assert result["description"] == "Updated description"
        assert result["max_users"] == 200

    def test_update_organization_not_found(self, client_with_auth):
        """Test updating non-existent organization."""
        response = client_with_auth.patch(
            "/api/admin/organizations/99999",
            json={"name": "New Name"},
        )
        assert response.status_code == 404

    def test_deactivate_organization(self, client_with_auth):
        """Test deactivating (soft-deleting) an organization."""
        # Create
        create_resp = client_with_auth.post(
            "/api/admin/organizations",
            json={"name": "Deactivate Test Org"},
        )
        assert create_resp.status_code == 201
        org_id = create_resp.json()["id"]

        # Deactivate
        response = client_with_auth.delete(f"/api/admin/organizations/{org_id}")
        assert response.status_code == 200
        assert (
            "деактивирована" in response.json()["message"].lower()
            or "deactivate" in response.json()["message"].lower()
        )

        # Verify not in active list
        list_resp = client_with_auth.get("/api/admin/organizations")
        active_ids = [o["id"] for o in list_resp.json() if o["is_active"]]
        assert org_id not in active_ids

    def test_list_with_inactive(self, client_with_auth):
        """Test listing organizations including inactive."""
        # Create and deactivate
        create_resp = client_with_auth.post(
            "/api/admin/organizations",
            json={"name": "Inactive Org"},
        )
        org_id = create_resp.json()["id"]
        client_with_auth.delete(f"/api/admin/organizations/{org_id}")

        # Without inactive
        resp1 = client_with_auth.get("/api/admin/organizations")
        ids1 = [o["id"] for o in resp1.json()]

        # With inactive
        resp2 = client_with_auth.get(
            "/api/admin/organizations", params={"include_inactive": True}
        )
        ids2 = [o["id"] for o in resp2.json()]

        assert org_id not in ids1
        assert org_id in ids2

    def test_assign_user_to_organization(self, client_with_auth, worker_user):
        """Test assigning a user to an organization."""
        # Create org
        create_resp = client_with_auth.post(
            "/api/admin/organizations",
            json={"name": "Assign Test Org"},
        )
        assert create_resp.status_code == 201
        org_id = create_resp.json()["id"]

        # Assign user
        response = client_with_auth.post(
            "/api/admin/organizations/assign-user",
            json={"user_id": worker_user.id, "organization_id": org_id},
        )
        assert response.status_code == 200
        assert response.json()["user_id"] == worker_user.id
        assert response.json()["organization_id"] == org_id

    def test_organization_user_count(self, client_with_auth, worker_user):
        """Test that user_count reflects assigned users."""
        # Create org
        create_resp = client_with_auth.post(
            "/api/admin/organizations",
            json={"name": "Count Test Org"},
        )
        org_id = create_resp.json()["id"]

        # Assign worker
        client_with_auth.post(
            "/api/admin/organizations/assign-user",
            json={"user_id": worker_user.id, "organization_id": org_id},
        )

        # Check count
        get_resp = client_with_auth.get(f"/api/admin/organizations/{org_id}")
        assert get_resp.json()["user_count"] == 1


class TestOrganizationsPermissions:
    """Tests for authorization of org endpoints."""

    def test_worker_cannot_list_organizations(self, client_with_worker):
        """Workers should not access organization management."""
        response = client_with_worker.get("/api/admin/organizations")
        assert response.status_code == 403

    def test_dispatcher_cannot_list_organizations(self, client_with_dispatcher):
        """Dispatchers should not access organization management."""
        response = client_with_dispatcher.get("/api/admin/organizations")
        assert response.status_code == 403

    def test_worker_cannot_create_organization(self, client_with_worker):
        """Workers should not create organizations."""
        response = client_with_worker.post(
            "/api/admin/organizations",
            json={"name": "Hacker Org"},
        )
        assert response.status_code == 403

    def test_unauthenticated_cannot_access(self, client):
        """Unauthenticated users cannot access organizations."""
        response = client.get("/api/admin/organizations")
        assert response.status_code in [401, 403]
