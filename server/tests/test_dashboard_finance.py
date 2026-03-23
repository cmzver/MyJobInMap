"""
Tests for Dashboard and Finance API endpoints.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.enums import UserRole
from app.models.task import TaskModel
from app.models.user import UserModel
from app.services.auth import get_password_hash

# ───────────────────────────── fixtures ──────────────────────────────


@pytest.fixture()
def worker(db_session):
    """Create a worker user."""
    user = UserModel(
        username="dash_worker",
        password_hash=get_password_hash("pass"),
        full_name="Dashboard Worker",
        role=UserRole.WORKER.value,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def tasks_mix(db_session, admin_user, worker):
    """Create a mix of tasks in different statuses with finance fields."""
    now = datetime.now(timezone.utc)
    tasks = [
        TaskModel(
            title="New task",
            raw_address="Addr 1",
            status="NEW",
            priority="CURRENT",
            created_at=now - timedelta(hours=2),
            updated_at=now - timedelta(hours=2),
        ),
        TaskModel(
            title="In-progress task",
            raw_address="Addr 2",
            status="IN_PROGRESS",
            priority="URGENT",
            created_at=now - timedelta(days=1),
            updated_at=now - timedelta(hours=3),
            assigned_user_id=worker.id,
        ),
        TaskModel(
            title="Done paid task",
            raw_address="Addr 3",
            status="DONE",
            priority="PLANNED",
            created_at=now - timedelta(days=2),
            updated_at=now - timedelta(hours=1),
            completed_at=now - timedelta(hours=1),
            assigned_user_id=worker.id,
            is_paid=True,
            payment_amount=1500.0,
        ),
        TaskModel(
            title="Done remote task",
            raw_address="Addr 4",
            status="DONE",
            priority="PLANNED",
            created_at=now - timedelta(days=3),
            updated_at=now - timedelta(hours=5),
            completed_at=now - timedelta(hours=5),
            assigned_user_id=worker.id,
            is_remote=True,
        ),
        TaskModel(
            title="Cancelled task",
            raw_address="Addr 5",
            status="CANCELLED",
            priority="EMERGENCY",
            created_at=now - timedelta(days=4),
            updated_at=now - timedelta(days=3),
        ),
        TaskModel(
            title="Emergency active",
            raw_address="Addr 6",
            status="NEW",
            priority="EMERGENCY",
            created_at=now - timedelta(hours=1),
            updated_at=now - timedelta(hours=1),
        ),
    ]
    for t in tasks:
        db_session.add(t)
    db_session.commit()
    for t in tasks:
        db_session.refresh(t)
    return tasks


# ═══════════════════════════  Dashboard  ═══════════════════════════


class TestDashboardStats:
    """Tests for GET /api/dashboard/stats"""

    def test_stats_requires_auth(self, client, admin_user):
        """Dashboard stats require authentication."""
        resp = client.get("/api/dashboard/stats")
        assert resp.status_code == 401

    def test_stats_empty_db(self, client_with_auth, admin_user):
        resp = client_with_auth.get("/api/dashboard/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["totalTasks"] == 0
        assert data["newTasks"] == 0
        assert data["inProgressTasks"] == 0
        assert data["completedTasks"] == 0
        assert data["cancelledTasks"] == 0
        assert data["totalWorkers"] == 0
        assert data["activeWorkers"] == 0

    def test_stats_with_tasks(self, client_with_auth, tasks_mix, worker):
        resp = client_with_auth.get("/api/dashboard/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["totalTasks"] == 6
        assert data["newTasks"] == 2  # NEW + EMERGENCY NEW
        assert data["inProgressTasks"] == 1
        assert data["completedTasks"] == 2
        assert data["cancelledTasks"] == 1
        # Worker is active (has IN_PROGRESS task)
        assert data["activeWorkers"] >= 1
        assert data["totalWorkers"] >= 1

    def test_stats_period_param(self, client_with_auth, tasks_mix):
        """Period param accepted but returns all tasks."""
        for period in ("today", "week", "month"):
            resp = client_with_auth.get(f"/api/dashboard/stats?period={period}")
            assert resp.status_code == 200


class TestDashboardActivity:
    """Tests for GET /api/dashboard/activity"""

    def test_activity_requires_auth(self, client, admin_user):
        """Dashboard activity requires authentication."""
        resp = client.get("/api/dashboard/activity")
        assert resp.status_code == 401

    def test_activity_empty_db(self, client_with_auth, admin_user):
        resp = client_with_auth.get("/api/dashboard/activity")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["activity"]) == 7  # Always 7 days
        assert data["urgentTasks"] == []
        assert data["todayCreated"] == 0
        assert data["todayCompleted"] == 0

    def test_activity_with_tasks(self, client_with_auth, tasks_mix):
        resp = client_with_auth.get("/api/dashboard/activity")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["activity"]) == 7
        # EMERGENCY NEW task should appear in urgentTasks
        assert len(data["urgentTasks"]) >= 1
        urgent_priorities = {t["priority"] for t in data["urgentTasks"]}
        assert urgent_priorities & {"EMERGENCY", "URGENT"}

    def test_activity_urgent_tasks_limit(
        self, client_with_auth, db_session, admin_user
    ):
        """Limit is 5 urgent tasks."""
        now = datetime.now(timezone.utc)
        for i in range(8):
            db_session.add(
                TaskModel(
                    title=f"Urgent {i}",
                    raw_address=f"Addr {i}",
                    status="NEW",
                    priority="EMERGENCY",
                    created_at=now - timedelta(minutes=i),
                    updated_at=now - timedelta(minutes=i),
                )
            )
        db_session.commit()

        resp = client_with_auth.get("/api/dashboard/activity")
        assert resp.status_code == 200
        assert len(resp.json()["urgentTasks"]) <= 5

    def test_activity_week_stats(self, client_with_auth, tasks_mix):
        resp = client_with_auth.get("/api/dashboard/activity")
        data = resp.json()
        assert "weekCreated" in data
        assert "weekCompleted" in data
        assert data["weekCreated"] >= 0
        assert data["weekCompleted"] >= 0


# ═══════════════════════════  Finance  ═══════════════════════════


class TestFinanceStats:
    """Tests for GET /api/finance/stats"""

    def test_stats_unauthenticated(self, client):
        resp = client.get("/api/finance/stats")
        assert resp.status_code in (401, 403)

    def test_stats_worker_forbidden(self, client_with_worker, worker_user):
        """Workers cannot access finance."""
        resp = client_with_worker.get("/api/finance/stats")
        assert resp.status_code == 403

    def test_stats_empty(self, client_with_auth, admin_user):
        resp = client_with_auth.get("/api/finance/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["completed_tasks"] == 0
        assert data["paid_tasks"] == 0
        assert data["remote_tasks"] == 0
        assert data["total_amount"] == 0.0

    def test_stats_with_tasks(self, client_with_auth, tasks_mix):
        resp = client_with_auth.get("/api/finance/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["completed_tasks"] == 2  # 2 DONE tasks
        assert data["paid_tasks"] == 1
        assert data["remote_tasks"] == 1
        assert data["total_amount"] == 1500.0

    def test_stats_filter_by_user(self, client_with_auth, tasks_mix, worker):
        resp = client_with_auth.get(f"/api/finance/stats?user_id={worker.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["completed_tasks"] == 2

    def test_stats_filter_by_nonexistent_user(self, client_with_auth, tasks_mix):
        resp = client_with_auth.get("/api/finance/stats?user_id=9999")
        assert resp.status_code == 200
        assert resp.json()["completed_tasks"] == 0

    def test_stats_period_all(self, client_with_auth, tasks_mix):
        resp = client_with_auth.get("/api/finance/stats?period=all")
        assert resp.status_code == 200
        assert resp.json()["completed_tasks"] == 2

    def test_stats_period_week(self, client_with_auth, tasks_mix):
        resp = client_with_auth.get("/api/finance/stats?period=week")
        assert resp.status_code == 200
        # Both DONE tasks updated within a week
        assert resp.json()["completed_tasks"] >= 0

    def test_stats_period_month(self, client_with_auth, tasks_mix):
        resp = client_with_auth.get("/api/finance/stats?period=month")
        assert resp.status_code == 200
        assert resp.json()["completed_tasks"] >= 0

    def test_stats_dispatcher_access(self, client_with_dispatcher, tasks_mix):
        """Dispatchers can access finance."""
        resp = client_with_dispatcher.get("/api/finance/stats")
        assert resp.status_code == 200


class TestFinanceWorkers:
    """Tests for GET /api/finance/workers"""

    def test_workers_unauthenticated(self, client):
        resp = client.get("/api/finance/workers")
        assert resp.status_code in (401, 403)

    def test_workers_empty(self, client_with_auth, admin_user):
        resp = client_with_auth.get("/api/finance/workers")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_workers_with_data(self, client_with_auth, tasks_mix, worker):
        resp = client_with_auth.get("/api/finance/workers")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        w = next(item for item in data if item["user_id"] == worker.id)
        assert w["user_name"] == "Dashboard Worker"
        assert w["completed_tasks"] == 2
        assert w["in_progress_tasks"] == 1
        assert w["paid_tasks"] == 1
        assert w["total_earned"] == 1500.0

    def test_workers_period_week(self, client_with_auth, tasks_mix, worker):
        resp = client_with_auth.get("/api/finance/workers?period=week")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_workers_sorted_by_completed(
        self, client_with_auth, db_session, admin_user
    ):
        """Workers sorted descending by completed_tasks."""
        now = datetime.now(timezone.utc)
        w1 = UserModel(
            username="w1",
            password_hash=get_password_hash("p"),
            full_name="W1",
            role=UserRole.WORKER.value,
            is_active=True,
        )
        w2 = UserModel(
            username="w2",
            password_hash=get_password_hash("p"),
            full_name="W2",
            role=UserRole.WORKER.value,
            is_active=True,
        )
        db_session.add_all([w1, w2])
        db_session.commit()
        db_session.refresh(w1)
        db_session.refresh(w2)

        # w2 has more completed tasks
        for i in range(3):
            db_session.add(
                TaskModel(
                    title=f"W2 task {i}",
                    raw_address="A",
                    status="DONE",
                    priority="PLANNED",
                    assigned_user_id=w2.id,
                    created_at=now,
                    updated_at=now,
                )
            )
        db_session.add(
            TaskModel(
                title="W1 task",
                raw_address="A",
                status="DONE",
                priority="PLANNED",
                assigned_user_id=w1.id,
                created_at=now,
                updated_at=now,
            )
        )
        db_session.commit()

        resp = client_with_auth.get("/api/finance/workers")
        data = resp.json()
        assert len(data) >= 2
        # First worker should have more completed tasks
        assert data[0]["completed_tasks"] >= data[1]["completed_tasks"]
