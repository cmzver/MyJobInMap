"""Tests for backup scheduler service and configuration."""
import os
import gzip
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest


# ============================================================================
# Test: Configuration (.env support)
# ============================================================================

class TestConfiguration:
    """Test Settings loads env variables correctly."""

    def test_default_values(self):
        """Default settings should have sensible values."""
        from app.config import Settings
        s = Settings()
        assert s.PORT == 8001
        assert s.HOST == "0.0.0.0"
        assert s.ALGORITHM == "HS256"
        assert s.LOG_FORMAT == "text"
        assert s.RATE_LIMIT_MAX_ATTEMPTS == 5
        assert s.RATE_LIMIT_WINDOW_SECONDS == 60
        assert s.BACKUP_SCHEDULER_ENABLED is False
        assert s.BACKUP_SCHEDULE_HOUR == 3
        assert s.BACKUP_SCHEDULE_MINUTE == 0
        assert s.BACKUP_RETENTION_DAYS == 30

    def test_env_override(self, monkeypatch):
        """Environment variables override defaults."""
        monkeypatch.setenv("PORT", "9999")
        monkeypatch.setenv("RATE_LIMIT_MAX_ATTEMPTS", "10")
        monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "120")
        monkeypatch.setenv("BACKUP_SCHEDULER_ENABLED", "true")
        monkeypatch.setenv("BACKUP_SCHEDULE_HOUR", "5")
        monkeypatch.setenv("BACKUP_RETENTION_DAYS", "14")

        from app.config import Settings
        s = Settings()
        assert s.PORT == 9999
        assert s.RATE_LIMIT_MAX_ATTEMPTS == 10
        assert s.RATE_LIMIT_WINDOW_SECONDS == 120
        assert s.BACKUP_SCHEDULER_ENABLED is True
        assert s.BACKUP_SCHEDULE_HOUR == 5
        assert s.BACKUP_RETENTION_DAYS == 14

    def test_is_sqlite(self):
        """is_sqlite computed property."""
        from app.config import Settings
        s = Settings(DATABASE_URL="sqlite:///./test.db")
        assert s.is_sqlite is True
        assert s.is_postgres is False

    def test_is_postgres(self):
        """is_postgres computed property."""
        from app.config import Settings
        s = Settings(DATABASE_URL="postgresql://u:p@host/db")
        assert s.is_postgres is True
        assert s.is_sqlite is False

    def test_is_production(self):
        """is_production computed property."""
        from app.config import Settings
        s = Settings(ENVIRONMENT="production", SECRET_KEY="safe-key-12345678901234567890")
        assert s.is_production is True

    def test_production_secret_warning(self):
        """Warning when using default SECRET_KEY in production."""
        from app.config import Settings
        with pytest.warns(RuntimeWarning, match="SECRET_KEY"):
            Settings(ENVIRONMENT="production")

    def test_cors_origins_list(self, monkeypatch):
        """CORS_ORIGINS parsed as list."""
        monkeypatch.setenv("CORS_ORIGINS", '["https://a.com","https://b.com"]')
        from app.config import Settings
        s = Settings()
        assert "https://a.com" in s.CORS_ORIGINS
        assert "https://b.com" in s.CORS_ORIGINS


# ============================================================================
# Test: Rate limiter uses config
# ============================================================================

class TestRateLimiterConfig:
    """Test that rate limiter picks up configuration."""

    def test_default_rate_limiter(self):
        """login_rate_limiter should use config values."""
        from app.services.rate_limiter import login_rate_limiter
        from app.config import settings
        assert login_rate_limiter.max_attempts == settings.RATE_LIMIT_MAX_ATTEMPTS
        assert login_rate_limiter.window_seconds == settings.RATE_LIMIT_WINDOW_SECONDS


# ============================================================================
# Test: Backup Scheduler
# ============================================================================

class TestBackupScheduler:
    """Test backup scheduler service."""

    def test_scheduler_disabled_by_default(self):
        """Scheduler should not start when BACKUP_SCHEDULER_ENABLED=false."""
        from app.services.backup_scheduler import get_scheduler_status
        status = get_scheduler_status()
        assert status["enabled"] is False
        assert status["running"] is False

    def test_rotate_backups(self, tmp_path):
        """_rotate_backups should delete files older than retention."""
        from app.services.backup_scheduler import _rotate_backups

        # Create old and new backup files
        old_file = tmp_path / "tasks_db_20240101_030000.sqlite.gz"
        new_file = tmp_path / "tasks_db_20260215_030000.sqlite.gz"
        old_file.write_bytes(b"old backup data")
        new_file.write_bytes(b"new backup data")

        # Set old file mtime to 60 days ago
        old_mtime = time.time() - 60 * 86400
        os.utime(old_file, (old_mtime, old_mtime))

        deleted = _rotate_backups(tmp_path, retention_days=30)

        assert deleted == 1
        assert not old_file.exists()
        assert new_file.exists()

    def test_rotate_backups_keeps_recent(self, tmp_path):
        """_rotate_backups should keep files newer than retention."""
        from app.services.backup_scheduler import _rotate_backups

        recent = tmp_path / "tasks_db_20260214_030000.sqlite.gz"
        recent.write_bytes(b"recent data")

        deleted = _rotate_backups(tmp_path, retention_days=30)
        assert deleted == 0
        assert recent.exists()

    def test_rotate_backups_empty_dir(self, tmp_path):
        """_rotate_backups handles empty directory."""
        from app.services.backup_scheduler import _rotate_backups
        deleted = _rotate_backups(tmp_path, retention_days=30)
        assert deleted == 0

    def test_rotate_backups_dump_files(self, tmp_path):
        """_rotate_backups should also handle .dump files (PostgreSQL)."""
        from app.services.backup_scheduler import _rotate_backups

        dump = tmp_path / "tasks_db_20240101_030000.dump"
        dump.write_bytes(b"pg dump")
        old_mtime = time.time() - 60 * 86400
        os.utime(dump, (old_mtime, old_mtime))

        deleted = _rotate_backups(tmp_path, retention_days=30)
        assert deleted == 1
        assert not dump.exists()

    @patch("app.services.backup_scheduler.settings")
    def test_run_backup_creates_file(self, mock_settings, tmp_path):
        """_run_backup should create a gzipped backup file."""
        from app.services.backup_scheduler import _run_backup

        # Create a fake SQLite DB
        db_file = tmp_path / "tasks.db"
        db_file.write_bytes(b"SQLite format 3\x00" + b"\x00" * 100)

        mock_settings.DATABASE_URL = f"sqlite:///{db_file}"
        mock_settings.BASE_DIR = tmp_path
        mock_settings.BACKUP_RETENTION_DAYS = 30

        filename = _run_backup()
        assert filename is not None
        assert filename.endswith(".sqlite.gz")
        assert (tmp_path / "backups" / filename).exists()

    @patch("app.services.backup_scheduler.settings")
    def test_run_backup_non_sqlite_returns_none(self, mock_settings):
        """_run_backup should return None for non-SQLite DB."""
        from app.services.backup_scheduler import _run_backup

        mock_settings.DATABASE_URL = "postgresql://u:p@host/db"
        mock_settings.BASE_DIR = Path(tempfile.mkdtemp())
        mock_settings.BACKUP_RETENTION_DAYS = 30

        result = _run_backup()
        assert result is None

    def test_start_scheduler_disabled(self):
        """start_scheduler returns False when disabled."""
        from app.services.backup_scheduler import start_scheduler
        result = start_scheduler()
        assert result is False

    @patch("app.services.backup_scheduler.settings")
    def test_start_scheduler_non_sqlite(self, mock_settings):
        """start_scheduler returns False for PostgreSQL."""
        mock_settings.BACKUP_SCHEDULER_ENABLED = True
        mock_settings.is_sqlite = False
        mock_settings.is_postgres = True

        from app.services.backup_scheduler import start_scheduler
        result = start_scheduler()
        assert result is False

    @patch("app.services.backup_scheduler.settings")
    def test_start_scheduler_success(self, mock_settings):
        """start_scheduler starts APScheduler when enabled + SQLite."""
        mock_settings.BACKUP_SCHEDULER_ENABLED = True
        mock_settings.is_sqlite = True
        mock_settings.is_postgres = False
        mock_settings.BACKUP_SCHEDULE_HOUR = 3
        mock_settings.BACKUP_SCHEDULE_MINUTE = 0
        mock_settings.BACKUP_RETENTION_DAYS = 30

        from app.services.backup_scheduler import start_scheduler, stop_scheduler
        try:
            result = start_scheduler()
            assert result is True
        finally:
            stop_scheduler()

    def test_stop_scheduler_noop_when_not_started(self):
        """stop_scheduler should not crash when scheduler is None."""
        from app.services.backup_scheduler import stop_scheduler
        stop_scheduler()  # Should not raise

    @patch("app.services.backup_scheduler.settings")
    def test_get_scheduler_status_enabled_not_running(self, mock_settings):
        """get_scheduler_status when enabled but scheduler not started."""
        mock_settings.BACKUP_SCHEDULER_ENABLED = True
        mock_settings.BACKUP_SCHEDULE_HOUR = 4
        mock_settings.BACKUP_SCHEDULE_MINUTE = 30
        mock_settings.BACKUP_RETENTION_DAYS = 14

        import app.services.backup_scheduler as bs
        old_scheduler = bs._scheduler
        bs._scheduler = None

        try:
            from app.services.backup_scheduler import get_scheduler_status
            status = get_scheduler_status()
            assert status["enabled"] is True
            assert status["running"] is False
            assert status["schedule"] == "04:30"
            assert status["retention_days"] == 14
        finally:
            bs._scheduler = old_scheduler


# ============================================================================
# Test: Health detailed includes scheduler status
# ============================================================================

class TestHealthSchedulerStatus:
    """Test /health/detailed includes backup_scheduler info."""

    def test_health_detailed_includes_backup_scheduler(self, client):
        """Health detailed endpoint should include backup_scheduler field."""
        response = client.get("/health/detailed")
        assert response.status_code == 200
        data = response.json()
        assert "backup_scheduler" in data
        assert "enabled" in data["backup_scheduler"]
        assert "running" in data["backup_scheduler"]
