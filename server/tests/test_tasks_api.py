"""Tests for task API endpoints."""
import pytest
from datetime import datetime, timedelta


class TestTaskCreation:
    """Test POST /api/tasks endpoint."""

    def test_create_task_basic(self, client, admin_token):
        """Test basic task creation."""
        response = client.post(
            "/api/tasks",
            json={"title": "Fix leak", "address": "Main St, 10", "description": "Water leak"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Fix leak"
        assert data["raw_address"] == "Main St, 10"
        assert data["status"] == "NEW"

    def test_create_task_with_planned_date(self, client, admin_token):
        """Test task creation with planned_date."""
        planned = "2025-12-31"
        response = client.post(
            "/api/tasks",
            json={
                "title": "Fix leak",
                "address": "Main St, 10",
                "planned_date": planned,
                "priority": "URGENT",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["planned_date"] is not None
        assert "2025-12-31" in data["planned_date"]

    def test_create_task_with_payment(self, client, admin_token):
        """Test task creation with payment fields."""
        response = client.post(
            "/api/tasks",
            json={
                "title": "Repair",
                "address": "Oak Ave, 5",
                "is_paid": True,
                "payment_amount": 1500.0,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_paid"] is True
        assert data["payment_amount"] == 1500.0

    def test_create_task_invalid_planned_date(self, client, admin_token):
        """Test task creation with invalid planned_date format."""
        response = client.post(
            "/api/tasks",
            json={"title": "Task", "address": "St, 1", "planned_date": "invalid"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 422  # Validation error


class TestTaskRetrieval:
    """Test GET /api/tasks endpoint."""

    def test_get_tasks_empty(self, client, admin_token):
        """Test getting tasks when none exist."""
        response = client.get(
            "/api/tasks?all_tasks=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        # Response is now PaginatedResponse with items field
        assert data["items"] == []
        assert data["total"] == 0

    def test_get_tasks_after_creation(self, client, admin_token):
        """Test getting tasks after creation."""
        # Create task
        client.post(
            "/api/tasks",
            json={"title": "Test task", "address": "Test St"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Get tasks
        response = client.get(
            "/api/tasks?all_tasks=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        tasks = data["items"]  # PaginatedResponse has items field
        assert len(tasks) >= 1
        assert any(t["title"] == "Test task" for t in tasks)


class TestAdminUpdate:
    """Test PUT /api/admin/tasks/{id} endpoint."""

    def test_update_task_planned_date(self, client, admin_token):
        """Test updating task with planned_date."""
        # Create task
        create_resp = client.post(
            "/api/tasks",
            json={"title": "Initial", "address": "St, 1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        task_id = create_resp.json()["id"]

        # Update with planned_date
        response = client.put(
            f"/api/admin/tasks/{task_id}",
            json={"planned_date": "2025-12-25"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "2025-12-25" in data["planned_date"]

    def test_update_task_full(self, client, admin_token):
        """Test full task update."""
        # Create task
        create_resp = client.post(
            "/api/tasks",
            json={"title": "Old title", "address": "Old St"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        task_id = create_resp.json()["id"]

        # Full update
        response = client.put(
            f"/api/admin/tasks/{task_id}",
            json={
                "title": "New title",
                "status": "IN_PROGRESS",
                "priority": "EMERGENCY",
                "is_paid": True,
                "payment_amount": 5000.0,
                "planned_date": "2025-12-20",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "New title"
        assert data["status"] == "IN_PROGRESS"
        assert data["is_paid"] is True
        assert data["payment_amount"] == 5000.0
