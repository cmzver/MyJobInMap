"""Tests for /api/admin endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import UserModel, UserRole


class TestAdminUsers:
    """Tests for admin user management endpoints."""

    def test_get_users_list(self, client: TestClient, auth_headers: dict):
        """Test getting list of users."""
        response = client.get("/api/admin/users", headers=auth_headers)
        
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        assert len(users) >= 1  # At least admin user exists
        
        # Check admin user is in the list
        admin = next((u for u in users if u["username"] == "admin"), None)
        assert admin is not None
        assert admin["role"] == "admin"

    def test_get_users_requires_admin(self, client: TestClient):
        """Test that non-admin cannot access users list."""
        response = client.get("/api/admin/users")
        assert response.status_code == 401

    def test_create_user_success(self, client: TestClient, auth_headers: dict):
        """Test creating a new user."""
        new_user = {
            "username": "newworker",
            "password": "newpass123",
            "full_name": "New Worker",
            "role": "worker"
        }
        
        response = client.post(
            "/api/admin/users",
            json=new_user,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "newworker"
        assert data["full_name"] == "New Worker"
        assert data["role"] == "worker"
        assert "password" not in data  # Password should not be returned

    def test_create_user_duplicate_username(self, client: TestClient, auth_headers: dict):
        """Test creating user with existing username fails."""
        new_user = {
            "username": "admin",  # Already exists
            "password": "pass123",
            "full_name": "Duplicate Admin"
        }
        
        response = client.post(
            "/api/admin/users",
            json=new_user,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()

    # Note: GET /api/admin/users/{id} endpoint does not exist
    # Users are managed via list and update endpoints only

    def test_update_user(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test updating user."""
        # Create a user to update
        from app.services.auth import get_password_hash
        user = UserModel(
            username="updateme",
            password_hash=get_password_hash("pass123"),
            full_name="Original Name",
            role=UserRole.WORKER.value
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        
        response = client.put(
            f"/api/admin/users/{user.id}",
            json={"full_name": "Updated Name"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["full_name"] == "Updated Name"

    def test_delete_user(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test deleting user."""
        from app.services.auth import get_password_hash
        user = UserModel(
            username="deleteme",
            password_hash=get_password_hash("pass123"),
            full_name="Delete Me",
            role=UserRole.WORKER.value
        )
        db_session.add(user)
        db_session.commit()
        user_id = user.id
        
        response = client.delete(
            f"/api/admin/users/{user_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        
        # Verify user is deleted
        deleted_user = db_session.get(UserModel, user_id)
        assert deleted_user is None

    def test_delete_self_fails(self, client: TestClient, auth_headers: dict, admin_user: UserModel):
        """Test that admin cannot delete themselves."""
        response = client.delete(
            f"/api/admin/users/{admin_user.id}",
            headers=auth_headers
        )
        
        # Should fail or be prevented
        assert response.status_code in [400, 403]


class TestAdminStats:
    """Tests for admin statistics endpoints."""

    def test_get_user_stats(self, client: TestClient, auth_headers: dict, admin_user: UserModel):
        """Test getting user statistics."""
        response = client.get(
            f"/api/admin/users/{admin_user.id}/stats",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "total_tasks" in data
        assert "completed_tasks" in data


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    def test_health_check(self, client: TestClient):
        """Test basic health check."""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_health_check_detailed(self, client: TestClient):
        """Test detailed health check."""
        response = client.get("/health/detailed")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["ok", "degraded"]
        assert "database" in data
        assert "memory" in data
        assert "system" in data


class TestAdminDevices:
    """Tests for admin device management."""

    def test_get_devices_list(self, client: TestClient, auth_headers: dict):
        """Test getting list of registered devices."""
        response = client.get("/api/admin/devices", headers=auth_headers)
        
        assert response.status_code == 200
        devices = response.json()
        assert isinstance(devices, list)
