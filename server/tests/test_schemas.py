"""Tests for task creation and planned_date validation."""
from datetime import datetime
import pytest
from app.schemas.task import TaskCreate, TaskUpdate


class TestPlannedDateValidator:
    """Test planned_date validator for date-only and ISO formats."""

    def test_planned_date_none(self):
        """Test None value."""
        task = TaskCreate(title="Test", address="Test St", planned_date=None)
        assert task.planned_date is None

    def test_planned_date_empty_string(self):
        """Test empty string converts to None."""
        task = TaskCreate(title="Test", address="Test St", planned_date="")
        assert task.planned_date is None

    def test_planned_date_date_only(self):
        """Test YYYY-MM-DD format."""
        task = TaskCreate(title="Test", address="Test St", planned_date="2025-12-25")
        assert task.planned_date == datetime(2025, 12, 25, 0, 0, 0)

    def test_planned_date_iso_datetime(self):
        """Test full ISO datetime format."""
        task = TaskCreate(title="Test", address="Test St", planned_date="2025-12-25T14:30:00")
        assert task.planned_date == datetime(2025, 12, 25, 14, 30, 0)

    def test_planned_date_invalid_format(self):
        """Test invalid format raises error."""
        with pytest.raises(ValueError, match="planned_date must be ISO date or datetime"):
            TaskCreate(title="Test", address="Test St", planned_date="invalid-date")

    def test_task_update_with_planned_date(self):
        """Test TaskUpdate with planned_date."""
        update = TaskUpdate(planned_date="2025-12-31")
        assert update.planned_date == datetime(2025, 12, 31, 0, 0, 0)

    def test_task_update_planned_date_none(self):
        """Test TaskUpdate with None planned_date."""
        update = TaskUpdate(title="New title", planned_date=None)
        assert update.planned_date is None
