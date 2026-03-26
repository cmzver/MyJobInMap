"""Tests for task API endpoints."""

from datetime import datetime, timedelta, timezone

import pytest


class TestTaskCreation:
    """Test POST /api/tasks endpoint."""

    def test_create_task_basic(self, client, admin_token):
        """Test basic task creation."""
        response = client.post(
            "/api/tasks",
            json={
                "title": "Fix leak",
                "address": "Main St, 10",
                "description": "Water leak",
            },
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

    def test_get_tasks_repairs_invalid_coordinates_from_known_address(
        self, client, admin_token, db_session, monkeypatch
    ):
        """List response should auto-repair legacy 0,0 coordinates when an address card exists."""
        from app.models import AddressModel, TaskModel

        known_address = AddressModel(
            address="Невская ул., д. 11/1, Санкт-Петербург",
            city="Санкт-Петербург",
            street="Невская ул.",
            building="11/1",
            lat=59.9386,
            lon=30.3141,
            is_active=True,
        )
        broken_task = TaskModel(
            title="Broken map task",
            raw_address="СПб, Невская ул., д. 11/1",
            description="Needs repair",
            lat=0.0,
            lon=0.0,
            status="NEW",
            priority="CURRENT",
        )
        db_session.add_all([known_address, broken_task])
        db_session.commit()

        monkeypatch.setattr(
            "app.services.task_service.geocoding_service.geocode",
            lambda _: (0.0, 0.0),
        )

        response = client.get(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        items = response.json()["items"]
        matched_task = next(item for item in items if item["id"] == broken_task.id)
        assert matched_task["lat"] == pytest.approx(59.9386)
        assert matched_task["lon"] == pytest.approx(30.3141)

    def test_get_tasks_sorted_by_created_at_asc(self, client, admin_token):
        """Test getting tasks sorted by creation date ascending."""
        client.post(
            "/api/tasks",
            json={"title": "First task", "address": "First St", "priority": "CURRENT"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        client.post(
            "/api/tasks",
            json={
                "title": "Second task",
                "address": "Second St",
                "priority": "CURRENT",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        response = client.get(
            "/api/tasks?sort=created_at_asc",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        items = response.json()["items"]
        titles = [item["title"] for item in items[:2]]
        assert titles == ["First task", "Second task"]

    def test_get_tasks_prioritizes_unread_notifications_for_admin(
        self, client, admin_token, admin_user, db_session
    ):
        """Admin sees tasks with unread notifications first in default newest-first mode."""
        from app.models import NotificationModel, TaskModel

        now = datetime.now(timezone.utc)
        older_notified = TaskModel(
            title="Older task with notification",
            description="Test",
            raw_address="Old St",
            status="NEW",
            priority="CURRENT",
            created_at=now - timedelta(days=2),
            updated_at=now - timedelta(days=2),
        )
        newer_regular = TaskModel(
            title="Newer task without notification",
            description="Test",
            raw_address="New St",
            status="NEW",
            priority="CURRENT",
            created_at=now - timedelta(hours=1),
            updated_at=now - timedelta(hours=1),
        )
        db_session.add_all([older_notified, newer_regular])
        db_session.commit()
        db_session.refresh(older_notified)
        db_session.refresh(newer_regular)

        db_session.add(
            NotificationModel(
                user_id=admin_user.id,
                title="Unread update",
                message="Task changed",
                type="task",
                task_id=older_notified.id,
                is_read=False,
                created_at=now,
            )
        )
        db_session.commit()

        response = client.get(
            "/api/tasks?sort=created_at_desc",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        items = response.json()["items"]
        assert [item["id"] for item in items[:2]] == [
            older_notified.id,
            newer_regular.id,
        ]

    def test_get_tasks_prioritizes_unread_notifications_for_dispatcher(
        self, client_with_dispatcher, dispatcher_user, db_session
    ):
        """Dispatcher sees tasks with unread notifications first in default newest-first mode."""
        from app.models import (NotificationModel, TaskModel,
                                init_default_settings)

        init_default_settings(db_session)

        now = datetime.now(timezone.utc)
        older_notified = TaskModel(
            title="Dispatcher notified task",
            description="Test",
            raw_address="Old St",
            status="NEW",
            priority="CURRENT",
            created_at=now - timedelta(days=1),
            updated_at=now - timedelta(days=1),
        )
        newer_regular = TaskModel(
            title="Dispatcher regular task",
            description="Test",
            raw_address="New St",
            status="NEW",
            priority="CURRENT",
            created_at=now - timedelta(minutes=30),
            updated_at=now - timedelta(minutes=30),
        )
        db_session.add_all([older_notified, newer_regular])
        db_session.commit()
        db_session.refresh(older_notified)
        db_session.refresh(newer_regular)

        db_session.add(
            NotificationModel(
                user_id=dispatcher_user.id,
                title="Unread update",
                message="Task changed",
                type="task",
                task_id=older_notified.id,
                is_read=False,
                created_at=now,
            )
        )
        db_session.commit()

        response = client_with_dispatcher.get("/api/tasks?sort=created_at_desc")

        assert response.status_code == 200
        items = response.json()["items"]
        assert [item["id"] for item in items[:2]] == [
            older_notified.id,
            newer_regular.id,
        ]

    def test_get_tasks_with_multiple_filters(
        self, client, admin_token, sample_tasks_for_reports, worker_user
    ):
        """Test getting tasks with repeated status, priority and assignee filters."""
        response = client.get(
            f"/api/tasks?status=NEW&status=IN_PROGRESS&priority=CURRENT&priority=URGENT&assignee_id={worker_user.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        items = response.json()["items"]
        statuses = {item["status"] for item in items}
        priorities = {item["priority"] for item in items}
        assignees = {item["assigned_user_id"] for item in items}

        assert len(items) == 2
        assert statuses == {"NEW", "IN_PROGRESS"}
        assert priorities == {"CURRENT", "URGENT"}
        assert assignees == {worker_user.id}


class TestAdminUpdate:
    """Test PATCH /api/admin/tasks/{id} endpoint."""

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
        response = client.patch(
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
        response = client.patch(
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


class TestTaskStatusUpdate:
    """Test PATCH /api/tasks/{id}/status endpoint."""

    def test_done_requires_comment(self, client, admin_token):
        create_resp = client.post(
            "/api/tasks",
            json={"title": "Task", "address": "St, 1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        task_id = create_resp.json()["id"]

        in_progress_resp = client.patch(
            f"/api/tasks/{task_id}/status",
            json={"status": "IN_PROGRESS"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert in_progress_resp.status_code == 200

        response = client.patch(
            f"/api/tasks/{task_id}/status",
            json={"status": "DONE", "comment": "   "},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 422
        assert "Комментарий обязателен" in response.json()["detail"]

    def test_cancelled_requires_comment(self, client, admin_token):
        create_resp = client.post(
            "/api/tasks",
            json={"title": "Task", "address": "St, 1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        task_id = create_resp.json()["id"]

        response = client.patch(
            f"/api/tasks/{task_id}/status",
            json={"status": "CANCELLED", "comment": ""},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 422
        assert "Комментарий обязателен" in response.json()["detail"]
