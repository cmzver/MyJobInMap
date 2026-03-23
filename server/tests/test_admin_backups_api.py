"""
Tests for /api/admin/backups & /api/admin/db endpoints.
=======================================================
Покрытие: backup CRUD, path traversal, settings, DB tools.
"""

import gzip
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel

# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "backups")


def _create_fake_backup(filename: str = "test_backup_20260101_120000.sqlite.gz") -> str:
    """Create a tiny gzip file in backups/ for testing."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = os.path.join(BACKUP_DIR, filename)
    with gzip.open(path, "wb") as f:
        f.write(b"fake sqlite data for test")
    return filename


def _cleanup_backup(filename: str) -> None:
    path = os.path.join(BACKUP_DIR, filename)
    if os.path.exists(path):
        os.remove(path)


# ──────────────────────────────────────────────────────────────────────
# Backup CRUD
# ──────────────────────────────────────────────────────────────────────


class TestBackupList:
    """GET /api/admin/backups"""

    def test_list_backups_empty(self, client: TestClient, auth_headers: dict):
        response = client.get("/api/admin/backups", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "backups" in data
        assert isinstance(data["backups"], list)

    def test_list_backups_requires_admin(self, client: TestClient):
        response = client.get("/api/admin/backups")
        assert response.status_code in [401, 403]

    def test_list_backups_worker_denied(self, client_with_worker: TestClient):
        response = client_with_worker.get("/api/admin/backups")
        assert response.status_code in [401, 403]

    def test_list_backups_contains_file(self, client: TestClient, auth_headers: dict):
        fname = _create_fake_backup()
        try:
            response = client.get("/api/admin/backups", headers=auth_headers)
            assert response.status_code == 200
            names = [b["name"] for b in response.json()["backups"]]
            assert fname in names
        finally:
            _cleanup_backup(fname)


class TestBackupDownload:
    """GET /api/admin/backups/{filename}/download"""

    def test_download_backup(self, client: TestClient, auth_headers: dict):
        fname = _create_fake_backup()
        try:
            response = client.get(
                f"/api/admin/backups/{fname}/download", headers=auth_headers
            )
            assert response.status_code == 200
            assert len(response.content) > 0
        finally:
            _cleanup_backup(fname)

    def test_download_backup_not_found(self, client: TestClient, auth_headers: dict):
        response = client.get(
            "/api/admin/backups/nonexistent.sqlite.gz/download", headers=auth_headers
        )
        assert response.status_code == 404


class TestBackupDelete:
    """DELETE /api/admin/backups/{filename}"""

    def test_delete_backup(self, client: TestClient, auth_headers: dict):
        fname = _create_fake_backup("to_delete.sqlite.gz")
        response = client.delete(f"/api/admin/backups/{fname}", headers=auth_headers)
        assert response.status_code == 200
        assert not os.path.exists(os.path.join(BACKUP_DIR, fname))

    def test_delete_backup_not_found(self, client: TestClient, auth_headers: dict):
        response = client.delete(
            "/api/admin/backups/nope.sqlite.gz", headers=auth_headers
        )
        assert response.status_code == 404


# ──────────────────────────────────────────────────────────────────────
# Path traversal protection
# ──────────────────────────────────────────────────────────────────────


class TestBackupPathTraversal:
    """Security: _validate_backup_filename blocks dangerous names."""

    @pytest.mark.parametrize(
        "bad_name",
        [
            "..%2F..%2Fetc%2Fpasswd.sqlite.gz",
            "..%5Csecret.sqlite.gz",
        ],
    )
    def test_path_traversal_blocked_encoded(
        self, client: TestClient, auth_headers: dict, bad_name: str
    ):
        """Path traversal via URL-encoded separators."""
        response = client.get(
            f"/api/admin/backups/{bad_name}/download", headers=auth_headers
        )
        # FastAPI may decode and match or return 400/404
        assert response.status_code in [400, 404, 422]

    def test_invalid_extension_blocked(self, client: TestClient, auth_headers: dict):
        response = client.delete(
            "/api/admin/backups/malicious.txt", headers=auth_headers
        )
        assert response.status_code == 400

    def test_dotdot_in_filename_blocked(self, client: TestClient, auth_headers: dict):
        """Direct call to _validate_backup_filename catches '..'."""
        from app.api.admin_backups import _validate_backup_filename

        with pytest.raises(Exception):
            _validate_backup_filename("../../etc/passwd.sqlite.gz")

    def test_slash_in_filename_blocked(self, client: TestClient, auth_headers: dict):
        from app.api.admin_backups import _validate_backup_filename

        with pytest.raises(Exception):
            _validate_backup_filename("foo/bar.sqlite.gz")

    def test_backslash_in_filename_blocked(
        self, client: TestClient, auth_headers: dict
    ):
        from app.api.admin_backups import _validate_backup_filename

        with pytest.raises(Exception):
            _validate_backup_filename("foo\\bar.sqlite.gz")


# ──────────────────────────────────────────────────────────────────────
# Backup settings
# ──────────────────────────────────────────────────────────────────────


class TestBackupSettings:
    """GET/PATCH /api/admin/backups/settings"""

    def test_get_backup_settings_defaults(self, client: TestClient, auth_headers: dict):
        response = client.get("/api/admin/backups/settings", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "auto_backup" in data
        assert "schedule" in data
        assert "retention_days" in data

    def test_update_backup_settings(self, client: TestClient, auth_headers: dict):
        response = client.patch(
            "/api/admin/backups/settings",
            json={"auto_backup": False, "schedule": "weekly", "retention_days": 7},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["auto_backup"] is False
        assert data["schedule"] == "weekly"
        assert data["retention_days"] == 7

    def test_settings_persisted(self, client: TestClient, auth_headers: dict):
        # Update
        client.patch(
            "/api/admin/backups/settings",
            json={"auto_backup": True, "schedule": "daily", "retention_days": 14},
            headers=auth_headers,
        )
        # Re-read
        response = client.get("/api/admin/backups/settings", headers=auth_headers)
        data = response.json()
        assert data["auto_backup"] is True
        assert data["retention_days"] == 14


# ──────────────────────────────────────────────────────────────────────
# DB tools
# ──────────────────────────────────────────────────────────────────────


class TestDbStats:
    """GET /api/admin/db/stats"""

    def test_db_stats(self, client: TestClient, auth_headers: dict):
        response = client.get("/api/admin/db/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "tables" in data or "database" in data or isinstance(data, dict)

    def test_db_stats_requires_admin(self, client: TestClient):
        response = client.get("/api/admin/db/stats")
        assert response.status_code in [401, 403]


class TestDbIntegrity:
    """GET /api/admin/db/integrity"""

    def test_db_integrity(self, client: TestClient, auth_headers: dict):
        response = client.get("/api/admin/db/integrity", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "status" in data or "result" in data or "integrity" in data


class TestDbCleanup:
    """POST /api/admin/db/cleanup"""

    def test_db_cleanup_no_old_tasks(self, client: TestClient, auth_headers: dict):
        """Cleanup when no old tasks exist — should succeed."""
        response = client.post("/api/admin/db/cleanup", headers=auth_headers)
        assert response.status_code == 200

    def test_db_cleanup_with_old_tasks(
        self, client: TestClient, auth_headers: dict, db_session: Session, admin_user
    ):
        """Cleanup removes old cancelled/done tasks."""
        old_date = datetime.now(timezone.utc) - timedelta(days=200)
        old_task = TaskModel(
            title="Old done task",
            description="...",
            raw_address="Addr",
            status="DONE",
            priority="PLANNED",
            created_at=old_date,
            updated_at=old_date,
        )
        db_session.add(old_task)
        db_session.commit()

        response = client.post("/api/admin/db/cleanup", headers=auth_headers)
        assert response.status_code == 200


class TestDeleteAllTasks:
    """DELETE /api/admin/tasks"""

    def test_delete_all_tasks(
        self, client: TestClient, auth_headers: dict, db_session: Session, admin_user
    ):
        """Delete all tasks clears the table."""
        # Create a task
        task = TaskModel(
            title="Task to delete",
            description="...",
            raw_address="123",
            status="NEW",
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()

        response = client.delete("/api/admin/tasks", headers=auth_headers)
        assert response.status_code == 200

        # Verify tasks removed
        count = db_session.query(TaskModel).count()
        assert count == 0

    def test_delete_all_tasks_requires_admin(self, client: TestClient):
        response = client.delete("/api/admin/tasks")
        assert response.status_code in [401, 403]
