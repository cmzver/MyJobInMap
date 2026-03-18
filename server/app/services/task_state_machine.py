"""Task status transitions validator."""
import json
from pathlib import Path
from typing import Dict, Set

from app.models.enums import TaskStatus


<<<<<<< HEAD
def _get_transitions_path() -> Path:
    """Resolve the shared transitions definition in both local and container setups."""
    current_path = Path(__file__).resolve()
    candidate_paths = [
        current_path.parents[1] / "config" / "taskStatusTransitions.json",
        current_path.parents[3] / "portal" / "src" / "config" / "taskStatusTransitions.json",
    ]

    for candidate_path in candidate_paths:
        if candidate_path.exists():
            return candidate_path

    raise FileNotFoundError(
        "Task status transitions definition not found. "
        f"Checked: {', '.join(str(path) for path in candidate_paths)}"
    )


def _load_valid_transitions() -> Dict[str, Set[str]]:
    """Load status transitions from the shared JSON definition."""
    transitions_path = _get_transitions_path()
=======
def _load_valid_transitions() -> Dict[str, Set[str]]:
    """Load status transitions from the shared JSON definition."""
    transitions_path = Path(__file__).resolve().parents[3] / "portal" / "src" / "config" / "taskStatusTransitions.json"
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
    with transitions_path.open("r", encoding="utf-8") as file:
        raw_transitions = json.load(file)

    return {
        str(status): {str(next_status) for next_status in next_statuses}
        for status, next_statuses in raw_transitions.items()
    }


class TaskStatusMachine:
    """State machine for task status transitions."""

    # Допустимые переходы: статус X может переходить в статусы Y
    VALID_TRANSITIONS: Dict[str, Set[str]] = _load_valid_transitions()

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
