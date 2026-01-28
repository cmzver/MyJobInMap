"""Tests for task_state_machine service."""
import pytest
from app.services.task_state_machine import TaskStatusMachine
from app.models.enums import TaskStatus


class TestTaskStatusMachine:
    """Tests for TaskStatusMachine class."""

    # ============== Valid Transitions ==============

    def test_new_to_in_progress(self):
        """Test NEW -> IN_PROGRESS is valid."""
        assert TaskStatusMachine.is_valid_transition("NEW", "IN_PROGRESS") is True

    def test_new_to_cancelled(self):
        """Test NEW -> CANCELLED is valid."""
        assert TaskStatusMachine.is_valid_transition("NEW", "CANCELLED") is True

    def test_in_progress_to_done(self):
        """Test IN_PROGRESS -> DONE is valid."""
        assert TaskStatusMachine.is_valid_transition("IN_PROGRESS", "DONE") is True

    def test_in_progress_to_cancelled(self):
        """Test IN_PROGRESS -> CANCELLED is valid."""
        assert TaskStatusMachine.is_valid_transition("IN_PROGRESS", "CANCELLED") is True

    def test_same_status_always_valid(self):
        """Test same status transition is always valid."""
        for status in ["NEW", "IN_PROGRESS", "DONE", "CANCELLED"]:
            assert TaskStatusMachine.is_valid_transition(status, status) is True

    # ============== Invalid Transitions ==============

    def test_new_to_done_invalid(self):
        """Test NEW -> DONE is invalid (must go through IN_PROGRESS)."""
        assert TaskStatusMachine.is_valid_transition("NEW", "DONE") is False

    def test_done_to_active_valid(self):
        """Test DONE can transition back to active statuses."""
        assert TaskStatusMachine.is_valid_transition("DONE", "NEW") is True
        assert TaskStatusMachine.is_valid_transition("DONE", "IN_PROGRESS") is True
        assert TaskStatusMachine.is_valid_transition("DONE", "CANCELLED") is False

    def test_cancelled_to_active_valid(self):
        """Test CANCELLED can transition back to active statuses."""
        assert TaskStatusMachine.is_valid_transition("CANCELLED", "NEW") is True
        assert TaskStatusMachine.is_valid_transition("CANCELLED", "IN_PROGRESS") is True
        assert TaskStatusMachine.is_valid_transition("CANCELLED", "DONE") is False

    def test_in_progress_to_new_invalid(self):
        """Test IN_PROGRESS -> NEW is invalid (no going back)."""
        assert TaskStatusMachine.is_valid_transition("IN_PROGRESS", "NEW") is False

    # ============== get_valid_transitions ==============

    def test_get_valid_transitions_new(self):
        """Test valid transitions from NEW."""
        valid = TaskStatusMachine.get_valid_transitions("NEW")
        assert "IN_PROGRESS" in valid
        assert "CANCELLED" in valid
        assert "DONE" not in valid
        assert len(valid) == 2

    def test_get_valid_transitions_in_progress(self):
        """Test valid transitions from IN_PROGRESS."""
        valid = TaskStatusMachine.get_valid_transitions("IN_PROGRESS")
        assert "DONE" in valid
        assert "CANCELLED" in valid
        assert "NEW" not in valid
        assert len(valid) == 2

    def test_get_valid_transitions_done(self):
        """Test valid transitions from DONE."""
        valid = TaskStatusMachine.get_valid_transitions("DONE")
        assert "NEW" in valid
        assert "IN_PROGRESS" in valid
        assert "CANCELLED" not in valid
        assert len(valid) == 2

    def test_get_valid_transitions_cancelled(self):
        """Test valid transitions from CANCELLED."""
        valid = TaskStatusMachine.get_valid_transitions("CANCELLED")
        assert "NEW" in valid
        assert "IN_PROGRESS" in valid
        assert "DONE" not in valid
        assert len(valid) == 2

    def test_get_valid_transitions_unknown(self):
        """Test unknown status returns empty set."""
        valid = TaskStatusMachine.get_valid_transitions("UNKNOWN")
        assert len(valid) == 0

    # ============== validate_transition ==============

    def test_validate_valid_transition(self):
        """Test validate_transition does not raise for valid transition."""
        # Should not raise
        TaskStatusMachine.validate_transition("NEW", "IN_PROGRESS")

    def test_validate_invalid_transition_raises(self):
        """Test validate_transition raises ValueError for invalid transition."""
        with pytest.raises(ValueError) as exc_info:
            TaskStatusMachine.validate_transition("NEW", "DONE")
        
        assert "Cannot transition" in str(exc_info.value)
        assert "NEW" in str(exc_info.value)
        assert "DONE" in str(exc_info.value)

    def test_validate_from_terminal_raises(self):
        """Test validate_transition raises when trying invalid transition from DONE."""
        with pytest.raises(ValueError) as exc_info:
            TaskStatusMachine.validate_transition("DONE", "CANCELLED")
        
        assert "Cannot transition" in str(exc_info.value)

    # ============== Edge Cases ==============

    def test_case_sensitivity(self):
        """Test that status comparisons work correctly."""
        # These should work with uppercase as defined in enums
        assert TaskStatusMachine.is_valid_transition("NEW", "IN_PROGRESS") is True
        # Lowercase would not match (implementation uses exact strings)

    def test_all_enum_values_covered(self):
        """Test all TaskStatus enum values are in VALID_TRANSITIONS."""
        for status in TaskStatus:
            assert status.value in TaskStatusMachine.VALID_TRANSITIONS
