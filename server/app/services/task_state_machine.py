"""Task status transitions validator."""
from typing import Dict, Set
from app.models.enums import TaskStatus


class TaskStatusMachine:
    """State machine for task status transitions."""

    # Допустимые переходы: статус X может переходить в статусы Y
    VALID_TRANSITIONS: Dict[str, Set[str]] = {
        TaskStatus.NEW.value: {TaskStatus.IN_PROGRESS.value, TaskStatus.CANCELLED.value},
        TaskStatus.IN_PROGRESS.value: {TaskStatus.DONE.value, TaskStatus.CANCELLED.value},
        TaskStatus.DONE.value: {TaskStatus.IN_PROGRESS.value, TaskStatus.NEW.value},  # Можно вернуть в работу
        TaskStatus.CANCELLED.value: {TaskStatus.NEW.value, TaskStatus.IN_PROGRESS.value},  # Можно возобновить
    }

    @staticmethod
    def is_valid_transition(from_status: str, to_status: str) -> bool:
        """Check if transition is allowed."""
        if from_status == to_status:
            return True  # No change is always valid
        return to_status in TaskStatusMachine.VALID_TRANSITIONS.get(from_status, set())

    @staticmethod
    def get_valid_transitions(current_status: str) -> Set[str]:
        """Get all valid next statuses."""
        return TaskStatusMachine.VALID_TRANSITIONS.get(current_status, set())

    @staticmethod
    def validate_transition(from_status: str, to_status: str) -> None:
        """Raise ValueError if transition is not allowed."""
        if not TaskStatusMachine.is_valid_transition(from_status, to_status):
            valid = TaskStatusMachine.get_valid_transitions(from_status)
            raise ValueError(
                f"Cannot transition from {from_status} to {to_status}. "
                f"Valid transitions: {valid}"
            )
