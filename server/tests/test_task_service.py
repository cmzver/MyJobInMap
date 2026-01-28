"""Tests for TaskService class."""
import pytest
from sqlalchemy.orm import Session
from app.services.task_service import (
    TaskService,
    TaskNotFoundError,
    PermissionDeniedError,
    InvalidTransitionError,
)
from app.schemas import TaskCreate
from app.models import TaskModel, UserModel, UserRole, TaskStatus


class TestTaskServiceInit:
    """Tests for TaskService initialization."""

    def test_service_creation(self, db_session):
        """Test service can be created with db session."""
        service = TaskService(db_session)
        assert service.db is db_session


class TestTaskServiceGetById:
    """Tests for TaskService.get_by_id method."""

    def test_get_existing_task(self, db_session, admin_user):
        """Test getting existing task by ID."""
        # Create a task
        task = TaskModel(
            title="Test Task",
            raw_address="Test Address",
            description="Test Description",
            status=TaskStatus.NEW.value,
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()
        
        service = TaskService(db_session)
        result = service.get_by_id(task.id)
        
        assert result.id == task.id
        assert result.title == "Test Task"

    def test_get_nonexistent_task_raises(self, db_session):
        """Test getting non-existent task raises TaskNotFoundError."""
        service = TaskService(db_session)
        
        with pytest.raises(TaskNotFoundError) as exc_info:
            service.get_by_id(99999)
        
        assert exc_info.value.status_code == 404
        assert "99999" in exc_info.value.message


class TestTaskServiceGetList:
    """Tests for TaskService.get_list method."""

    def test_get_empty_list(self, db_session, admin_user):
        """Test getting empty task list."""
        service = TaskService(db_session)
        tasks = service.get_list(admin_user)
        
        assert tasks == []

    def test_get_list_with_tasks(self, db_session, admin_user):
        """Test getting list with tasks."""
        # Create tasks
        for i in range(3):
            task = TaskModel(
                title=f"Task {i}",
                raw_address=f"Address {i}",
                description=f"Description {i}",
                status=TaskStatus.NEW.value,
                priority="CURRENT",
            )
            db_session.add(task)
        db_session.commit()
        
        service = TaskService(db_session)
        tasks = service.get_list(admin_user)
        
        assert len(tasks) == 3

    def test_get_list_filter_by_status(self, db_session, admin_user):
        """Test filtering tasks by status."""
        # Create tasks with different statuses
        task1 = TaskModel(title="T1", raw_address="A1", status=TaskStatus.NEW.value, priority="CURRENT")
        task2 = TaskModel(title="T2", raw_address="A2", status=TaskStatus.IN_PROGRESS.value, priority="CURRENT")
        task3 = TaskModel(title="T3", raw_address="A3", status=TaskStatus.NEW.value, priority="CURRENT")
        db_session.add_all([task1, task2, task3])
        db_session.commit()
        
        service = TaskService(db_session)
        new_tasks = service.get_list(admin_user, status="NEW")
        
        assert len(new_tasks) == 2
        assert all(t.status == TaskStatus.NEW.value for t in new_tasks)


class TestTaskServiceCreate:
    """Tests for TaskService.create method."""

    def test_create_basic_task(self, db_session, admin_user):
        """Test basic task creation."""
        service = TaskService(db_session)
        
        task_data = TaskCreate(
            title="New Task",
            address="Test Address",
            description="Task description",
            priority="URGENT",
        )
        task = service.create(task_data, admin_user)
        
        assert task.id is not None
        assert task.title == "New Task"
        assert task.raw_address == "Test Address"
        assert task.status == TaskStatus.NEW.value
        assert task.priority == "URGENT"

    def test_create_with_planned_date(self, db_session, admin_user):
        """Test task creation with planned date."""
        from datetime import datetime
        
        service = TaskService(db_session)
        planned = datetime(2025, 12, 31, 12, 0, 0)
        
        task_data = TaskCreate(
            title="Planned Task",
            address="Address",
            description="Desc",
            planned_date=planned,
        )
        task = service.create(task_data, admin_user)
        
        assert task.planned_date is not None

    def test_create_with_payment(self, db_session, admin_user):
        """Test task creation with payment info."""
        service = TaskService(db_session)
        
        task_data = TaskCreate(
            title="Paid Task",
            address="Address",
            description="Desc",
            is_paid=True,
            payment_amount=5000.0,
        )
        task = service.create(task_data, admin_user)
        
        assert task.is_paid is True
        assert task.payment_amount == 5000.0


class TestTaskServiceUpdateStatus:
    """Tests for TaskService.update_status method."""

    def test_valid_status_transition(self, db_session, admin_user):
        """Test valid status transition NEW -> IN_PROGRESS."""
        # Create task
        task = TaskModel(
            title="Task",
            raw_address="Addr",
            status=TaskStatus.NEW.value,
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()
        
        service = TaskService(db_session)
        updated = service.update_status(task.id, "IN_PROGRESS", user=admin_user)
        
        assert updated.status == TaskStatus.IN_PROGRESS.value

    def test_invalid_status_transition_raises(self, db_session, admin_user):
        """Test invalid transition raises InvalidTransitionError."""
        # Create task
        task = TaskModel(
            title="Task",
            raw_address="Addr",
            status=TaskStatus.NEW.value,
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()
        
        service = TaskService(db_session)
        
        with pytest.raises(InvalidTransitionError) as exc_info:
            service.update_status(task.id, "DONE", user=admin_user)
        
        assert exc_info.value.status_code == 422

    def test_complete_task_sets_completed_at(self, db_session, admin_user):
        """Test completing task sets completed_at timestamp."""
        # Create task in IN_PROGRESS
        task = TaskModel(
            title="Task",
            raw_address="Addr",
            status=TaskStatus.IN_PROGRESS.value,
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()
        
        service = TaskService(db_session)
        updated = service.update_status(task.id, "DONE", user=admin_user)
        
        assert updated.status == TaskStatus.DONE.value
        assert updated.completed_at is not None


class TestTaskServiceAssign:
    """Tests for TaskService.assign method."""

    def test_assign_task_to_worker(self, db_session, admin_user):
        """Test assigning task to worker."""
        # Create worker
        worker = UserModel(
            username="worker",
            password_hash="hash",
            full_name="Worker Name",
            role=UserRole.WORKER.value,
            is_active=True,
        )
        db_session.add(worker)
        
        # Create task
        task = TaskModel(
            title="Task",
            raw_address="Addr",
            status=TaskStatus.NEW.value,
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()
        
        service = TaskService(db_session)
        updated = service.assign(task.id, worker.id, admin_user)
        
        assert updated.assigned_user_id == worker.id

    def test_unassign_task(self, db_session, admin_user):
        """Test unassigning task (set to None)."""
        # Create task with assignee
        task = TaskModel(
            title="Task",
            raw_address="Addr",
            status=TaskStatus.NEW.value,
            priority="CURRENT",
            assigned_user_id=admin_user.id,
        )
        db_session.add(task)
        db_session.commit()
        
        service = TaskService(db_session)
        updated = service.assign(task.id, None, admin_user)
        
        assert updated.assigned_user_id is None


class TestTaskServiceDelete:
    """Tests for TaskService.delete method."""

    def test_delete_existing_task(self, db_session, admin_user):
        """Test deleting existing task."""
        # Create task
        task = TaskModel(
            title="Task to Delete",
            raw_address="Addr",
            status=TaskStatus.NEW.value,
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()
        task_id = task.id
        
        service = TaskService(db_session)
        service.delete(task_id)
        
        # Verify deleted
        deleted = db_session.query(TaskModel).filter(TaskModel.id == task_id).first()
        assert deleted is None

    def test_delete_nonexistent_raises(self, db_session, admin_user):
        """Test deleting non-existent task raises error."""
        service = TaskService(db_session)
        
        with pytest.raises(TaskNotFoundError):
            service.delete(99999)


class TestTaskServiceExceptions:
    """Tests for TaskService custom exceptions."""

    def test_task_not_found_error(self):
        """Test TaskNotFoundError attributes."""
        error = TaskNotFoundError(123)
        
        assert error.status_code == 404
        assert "123" in error.message

    def test_permission_denied_error(self):
        """Test PermissionDeniedError attributes."""
        error = PermissionDeniedError("Custom message")
        
        assert error.status_code == 403
        assert error.message == "Custom message"

    def test_invalid_transition_error(self):
        """Test InvalidTransitionError attributes."""
        error = InvalidTransitionError("NEW", "DONE")
        
        assert error.status_code == 422
        assert "NEW" in error.message
        assert "DONE" in error.message


class TestTaskServiceStatusNames:
    """Tests for status/priority name mappings (moved to utils)."""

    def test_status_names_mapping(self):
        """Test STATUS_DISPLAY_NAMES contains all statuses."""
        from app.utils import STATUS_DISPLAY_NAMES
        assert STATUS_DISPLAY_NAMES["NEW"] == "Новая"
        assert STATUS_DISPLAY_NAMES["IN_PROGRESS"] == "В работе"
        assert STATUS_DISPLAY_NAMES["DONE"] == "Выполнена"
        assert STATUS_DISPLAY_NAMES["CANCELLED"] == "Отменена"

    def test_priority_names_mapping(self):
        """Test PRIORITY_DISPLAY_NAMES contains all priorities."""
        from app.utils import PRIORITY_DISPLAY_NAMES
        from app.models.enums import TaskPriority
        assert PRIORITY_DISPLAY_NAMES[TaskPriority.PLANNED.value] == "????????"
        assert PRIORITY_DISPLAY_NAMES[TaskPriority.CURRENT.value] == "???????"
        assert PRIORITY_DISPLAY_NAMES[TaskPriority.URGENT.value] == "???????"
        assert PRIORITY_DISPLAY_NAMES[TaskPriority.EMERGENCY.value] == "?????????"
