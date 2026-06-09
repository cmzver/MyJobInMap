"""Tests for the tasks summary endpoint and core API accessibility."""


class TestApiAccessibility:
    """Core endpoints remain reachable under /api/."""

    def test_tasks_accessible(self, client_with_auth):
        """/api/tasks should work."""
        response = client_with_auth.get("/api/tasks")
        assert response.status_code == 200

    def test_auth_me(self, client_with_auth):
        """/api/auth/me should work."""
        response = client_with_auth.get("/api/auth/me")
        assert response.status_code == 200

    def test_health_endpoint(self, client):
        """Health endpoint should remain at root."""
        response = client.get("/health")
        assert response.status_code == 200
        assert "version" in response.json()

    def test_tasks_no_envelope(self, client_with_auth):
        """/api/tasks uses the plain paginated format (no envelope)."""
        response = client_with_auth.get("/api/tasks")
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "meta" not in data


class TestTasksSummary:
    """Test /api/tasks/summary aggregate endpoint."""

    def test_summary_empty(self, client_with_auth):
        """Summary with no tasks returns zeroed counts."""
        response = client_with_auth.get("/api/tasks/summary")
        assert response.status_code == 200
        summary = response.json()

        assert summary["total"] == 0
        assert summary["unassigned"] == 0
        assert summary["overdue"] == 0
        assert summary["by_status"]["NEW"] == 0
        assert summary["by_status"]["DONE"] == 0

    def test_summary_with_tasks(self, client_with_auth, sample_tasks_for_reports):
        """Summary aggregates existing tasks by status."""
        response = client_with_auth.get("/api/tasks/summary")
        assert response.status_code == 200
        summary = response.json()

        assert summary["total"] == 4
        assert summary["by_status"]["NEW"] == 1
        assert summary["by_status"]["IN_PROGRESS"] == 1
        assert summary["by_status"]["DONE"] == 1
        assert summary["by_status"]["CANCELLED"] == 1

    def test_summary_requires_auth(self, client):
        """Summary endpoint requires authentication."""
        response = client.get("/api/tasks/summary")
        assert response.status_code in [401, 403]
