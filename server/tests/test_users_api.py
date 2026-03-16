"""Tests for public users API alias endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel, UserRole
from app.services.auth import get_password_hash


class TestUsersApi:
    """Regression tests for /api/users endpoints."""

    def test_get_users_requires_auth(self, client: TestClient):
        response = client.get("/api/users")

        assert response.status_code == 401

    def test_get_my_stats_requires_auth(self, client: TestClient):
        response = client.get("/api/users/me/stats")

        assert response.status_code == 401

    def test_get_my_stats_handles_timezone_aware_dates(
        self,
        client: TestClient,
        db_session: Session,
        worker_user: UserModel,
    ):
        login_response = client.post(
            "/api/auth/login",
            data={"username": "worker", "password": "worker"},
        )
        assert login_response.status_code == 200
        auth_headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

        now = datetime.now(timezone.utc)
        completed_task = TaskModel(
            title="Completed worker task",
            raw_address="Stats addr 1",
            status="DONE",
            priority="CURRENT",
            assigned_user_id=worker_user.id,
            created_at=now - timedelta(days=2),
            completed_at=now - timedelta(days=1),
            updated_at=now - timedelta(days=1),
        )
        in_progress_task = TaskModel(
            title="In progress worker task",
            raw_address="Stats addr 2",
            status="IN_PROGRESS",
            priority="URGENT",
            assigned_user_id=worker_user.id,
            created_at=now - timedelta(days=3),
            updated_at=now - timedelta(hours=5),
        )
        db_session.add_all([completed_task, in_progress_task])
        db_session.commit()

        response = client.get("/api/users/me/stats", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["total_tasks"] == 2
        assert data["completed_tasks"] == 1
        assert data["in_progress_tasks"] == 1
        assert data["tasks_this_week"] == 2
        assert data["tasks_this_month"] == 2
        assert data["avg_completion_hours"] == 24.0

    def test_public_create_user_respects_schema_and_role_value(
        self,
        client: TestClient,
        auth_headers: dict,
        db_session: Session,
    ):
        response = client.post(
            "/api/users",
            json={
                "username": "public_alias_user",
                "password": "secret123",
                "full_name": "Public Alias User",
                "role": "dispatcher",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "public_alias_user"
        assert data["role"] == "dispatcher"

        user = db_session.query(UserModel).filter(UserModel.username == "public_alias_user").first()
        assert user is not None
        assert user.role == UserRole.DISPATCHER.value
        assert user.password_hash != "secret123"

    def test_public_update_user_uses_current_schema(
        self,
        client: TestClient,
        auth_headers: dict,
        db_session: Session,
    ):
        user = UserModel(
            username="public_update_me",
            password_hash=get_password_hash("pass123"),
            full_name="Original Public User",
            role=UserRole.WORKER.value,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        response = client.patch(
            f"/api/users/{user.id}",
            json={"full_name": "Updated Public User", "role": "dispatcher"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["full_name"] == "Updated Public User"
        assert data["role"] == "dispatcher"

        db_session.refresh(user)
        assert user.full_name == "Updated Public User"
        assert user.role == UserRole.DISPATCHER.value