"""Tests for /api/admin endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import UserModel, UserRole, TaskModel


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
        
        response = client.patch(
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


class TestAdminWorkersEndpoint:
    """Tests for GET /api/admin/workers."""

    def test_get_workers_list(self, client: TestClient, auth_headers: dict, worker_user, dispatcher_user):
        """Workers endpoint returns workers and dispatchers."""
        response = client.get("/api/admin/workers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        usernames = [u["username"] for u in data]
        assert "worker" in usernames
        assert "dispatcher" in usernames
        # Admin should NOT be in the workers list
        assert "admin" not in usernames

    def test_get_workers_dispatcher_access(self, client_with_dispatcher: TestClient):
        """Dispatcher can access workers endpoint."""
        response = client_with_dispatcher.get("/api/admin/workers")
        assert response.status_code == 200

    def test_get_workers_worker_denied(self, client_with_worker: TestClient):
        """Worker cannot access workers endpoint."""
        response = client_with_worker.get("/api/admin/workers")
        assert response.status_code in [401, 403]


class TestAdminTaskUpdate:
    def test_update_task_unassigns_when_assigned_user_is_null(
        self, client: TestClient, auth_headers: dict, db_session: Session, worker_user
    ):
        task = TaskModel(
            title="Legacy Admin Task",
            raw_address="Addr",
            status="NEW",
            priority="CURRENT",
            assigned_user_id=worker_user.id,
        )
        db_session.add(task)
        db_session.commit()
        db_session.refresh(task)

        response = client.patch(
            f"/api/admin/tasks/{task.id}",
            json={"assigned_user_id": None},
            headers=auth_headers,
        )

        assert response.status_code == 200
        db_session.refresh(task)
        assert task.assigned_user_id is None

    def test_update_task_with_unknown_assignee_returns_404(
        self, client: TestClient, auth_headers: dict, db_session: Session
    ):
        task = TaskModel(
            title="Legacy Admin Task",
            raw_address="Addr",
            status="NEW",
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()
        db_session.refresh(task)

        response = client.patch(
            f"/api/admin/tasks/{task.id}",
            json={"assigned_user_id": 999999},
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestAdminUserStatsExtended:
    """Extended tests for user statistics."""

    def test_user_stats_not_found(self, client: TestClient, auth_headers: dict):
        """Stats for non-existent user returns 404."""
        response = client.get("/api/admin/users/99999/stats", headers=auth_headers)
        assert response.status_code == 404

    def test_user_stats_with_tasks(
        self, client: TestClient, auth_headers: dict, db_session: Session, worker_user
    ):
        """Stats correctly count tasks."""
        from app.models.task import TaskModel
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        tasks = [
            TaskModel(title="T1", raw_address="A", status="DONE", priority="PLANNED",
                      assigned_user_id=worker_user.id, created_at=now, updated_at=now),
            TaskModel(title="T2", raw_address="A", status="IN_PROGRESS", priority="CURRENT",
                      assigned_user_id=worker_user.id, created_at=now, updated_at=now),
            TaskModel(title="T3", raw_address="A", status="NEW", priority="URGENT",
                      assigned_user_id=worker_user.id, created_at=now, updated_at=now),
        ]
        for t in tasks:
            db_session.add(t)
        db_session.commit()

        response = client.get(
            f"/api/admin/users/{worker_user.id}/stats",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_tasks"] == 3
        assert data["completed_tasks"] == 1
        assert data["in_progress_tasks"] == 1

    def test_update_user_not_found(self, client: TestClient, auth_headers: dict):
        """Update non-existent user returns 404."""
        response = client.patch(
            "/api/admin/users/99999",
            json={"full_name": "Ghost"},
            headers=auth_headers
        )
        assert response.status_code == 404

    def test_update_user_role_change(
        self, client: TestClient, auth_headers: dict, db_session: Session
    ):
        """Change user role from worker to dispatcher."""
        from app.services.auth import get_password_hash
        user = UserModel(
            username="rolechange",
            password_hash=get_password_hash("pass"),
            full_name="Role Change",
            role=UserRole.WORKER.value,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        response = client.patch(
            f"/api/admin/users/{user.id}",
            json={"role": "dispatcher"},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["role"] == "dispatcher"
