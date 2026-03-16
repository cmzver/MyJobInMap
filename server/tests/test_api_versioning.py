"""Tests for API v2 endpoints (versioning + envelope format)."""

import pytest


class TestAPIVersioning:
    """Test API versioning structure."""

    def test_default_tasks_accessible(self, client_with_auth):
        """Default /api/tasks should work (backward compatible)."""
        response = client_with_auth.get("/api/tasks")
        assert response.status_code == 200

    def test_default_auth_me(self, client_with_auth):
        """Default /api/auth/me should work."""
        response = client_with_auth.get("/api/auth/me")
        assert response.status_code == 200

    def test_health_endpoint(self, client):
        """Health endpoint should remain at root."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "version" in data


class TestV2MetaEndpoint:
    """Test /api/v2/version endpoint."""

    def test_version_info(self, client):
        """Test that version endpoint returns API version info."""
        response = client.get("/api/v2/version")
        assert response.status_code == 200
        data = response.json()
        assert data["current_version"] == "v2"
        assert "v1" in data["supported_versions"]
        assert "v2" in data["supported_versions"]
        assert "server_version" in data
        assert "deprecation" in data

    def test_version_deprecation_info(self, client):
        """Test deprecation info in version response."""
        response = client.get("/api/v2/version")
        data = response.json()
        assert data["deprecation"]["v1"]["status"] == "supported"
        assert data["deprecation"]["v2"]["status"] == "current"


class TestV2TasksSummary:
    """Test /api/v2/tasks/summary endpoint."""

    def test_summary_empty(self, client_with_auth):
        """Test summary with no tasks."""
        response = client_with_auth.get("/api/v2/tasks/summary")
        assert response.status_code == 200
        data = response.json()

        # v2 envelope format
        assert "data" in data
        assert "meta" in data
        assert data["meta"]["api_version"] == "v2"

        summary = data["data"]
        assert summary["total"] == 0
        assert summary["unassigned"] == 0
        assert summary["overdue"] == 0
        assert summary["by_status"]["NEW"] == 0
        assert summary["by_status"]["DONE"] == 0

    def test_summary_with_tasks(self, client_with_auth, sample_tasks_for_reports):
        """Test summary with existing tasks."""
        response = client_with_auth.get("/api/v2/tasks/summary")
        assert response.status_code == 200
        data = response.json()

        summary = data["data"]
        assert summary["total"] == 4
        assert summary["by_status"]["NEW"] == 1
        assert summary["by_status"]["IN_PROGRESS"] == 1
        assert summary["by_status"]["DONE"] == 1
        assert summary["by_status"]["CANCELLED"] == 1

    def test_summary_envelope_format(self, client_with_auth):
        """Test that v2 envelope contains correct meta."""
        response = client_with_auth.get("/api/v2/tasks/summary")
        data = response.json()

        assert data["meta"]["api_version"] == "v2"
        assert "timestamp" in data["meta"]

    def test_summary_requires_auth(self, client):
        """Summary endpoint requires authentication."""
        response = client.get("/api/v2/tasks/summary")
        assert response.status_code in [401, 403]


class TestBackwardCompatibility:
    """Test that default endpoints remain unchanged."""

    def test_default_tasks_no_envelope(self, client_with_auth):
        """Default /api/tasks should NOT use envelope format."""
        response = client_with_auth.get("/api/tasks")
        data = response.json()
        # v1 format: {items, total, page, size}
        assert "items" in data
        assert "total" in data
        assert "meta" not in data

    def test_v2_version_endpoint(self, client):
        """v2 version endpoint should be accessible without auth."""
        response = client.get("/api/v2/version")
        assert response.status_code == 200
        assert response.json()["current_version"] == "v2"
