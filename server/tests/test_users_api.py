"""Tests for public users API alias endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel


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
        auth_headers = {
            "Authorization": f"Bearer {login_response.json()['access_token']}"
        }

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
