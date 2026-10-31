"""Tests for TaskService class."""

from datetime import datetime, timedelta, timezone

import pytest

from app.models import (
    AddressModel,
    OrganizationModel,
    OrganizationSettingsModel,
    TaskModel,
    TaskStatus,
    UserGroupModel,
    UserModel,
    UserRole,
)
from app.schemas import TaskCreate, TaskUpdate
from app.services.auth import get_password_hash
from app.services.role_utils import org_managers
from app.services.sla_service import get_sla_metrics
from app.services.task_service import (
    CommentRequiredError,
    InvalidTransitionError,
    PermissionDeniedError,
    TaskNotFoundError,
    TaskService,
)


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
        assert task.created_by_id == admin_user.id

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

    def test_create_uses_address_book_coordinates_before_geocoder(
        self, db_session, monkeypatch
    ):
        """Task creation should reuse known address coordinates when the address already exists."""
        org = OrganizationModel(
            name="Geo Org",
            slug="geo-org",
            is_active=True,
        )
        user = UserModel(
            username="geo_dispatcher",
            password_hash=get_password_hash("test"),
            full_name="Geo Dispatcher",
            role=UserRole.DISPATCHER.value,
            is_active=True,
            organization=org,
        )
        known_address = AddressModel(
            address="Невская ул., д. 11/1, Санкт-Петербург",
            city="Санкт-Петербург",
            street="Невская ул.",
            building="11/1",
            lat=59.9386,
            lon=30.3141,
            organization=org,
            is_active=True,
        )
        db_session.add_all([org, user, known_address])
        db_session.commit()

        monkeypatch.setattr(
            "app.services.task_service.geocoding_service.geocode",
            lambda _: (0.0, 0.0),
        )

        service = TaskService(db_session)
        task = service.create(
            TaskCreate(
                title="Address Match Task",
                address="СПб, Невская ул., д. 11/1",
                description="Task description",
            ),
            user,
        )

        assert task.lat == pytest.approx(59.9386)
        assert task.lon == pytest.approx(30.3141)
        # Заявка привязана к сматченному адресу — чтобы правка его координат
        # подхватывалась автоматически.
        assert task.address_id == known_address.id


class TestTaskServiceResolveCoordinates:
    """Координаты заявки из адресной книги: тот же дом — да, соседний — нет."""

    @pytest.fixture
    def book(self, db_session, monkeypatch):
        addresses = [
            AddressModel(
                address="Невская ул., д. 9, Новоселье",
                city="Новоселье",
                street="Невская ул.",
                building="9",
                lat=59.81,
                lon=30.22,
                is_active=True,
            ),
            AddressModel(
                address="Невская ул., д. 11/1, Санкт-Петербург",
                city="Санкт-Петербург",
                street="Невская ул.",
                building="11/1",
                lat=59.9386,
                lon=30.3141,
                is_active=True,
            ),
            AddressModel(
                address="Центральная ул., д. 3, Новоселье",
                city="Новоселье",
                street="Центральная ул.",
                building="3",
                lat=59.82,
                lon=30.23,
                is_active=True,
            ),
        ]
        db_session.add_all(addresses)
        db_session.commit()
        monkeypatch.setattr(
            "app.services.task_service.geocoding_service.geocode",
            lambda _: (1.0, 2.0),
        )
        return addresses

    @pytest.mark.parametrize(
        "raw_address, book_index",
        [
            # Улица без типа, посёлок через «г.п.».
            ("Невская, д. 9, г.п. Новоселье", 0),
            ("Невская ул., 9, Лен. обл. гп. Новоселье", 0),
            ("СПб, Невская ул., д. 11/1", 1),
            ("Центральная ул., д.3, Лен. обл. гп. Новоселье", 2),
        ],
    )
    def test_same_house_takes_book_coordinates(
        self, db_session, book, raw_address, book_index
    ):
        lat, lon, address_id = TaskService(db_session).resolve_coordinates(raw_address)

        assert address_id == book[book_index].id
        assert (lat, lon) == (book[book_index].lat, book[book_index].lon)

    @pytest.mark.parametrize(
        "raw_address",
        [
            # Дом 1 — не дом 11/1.
            "Невская ул., д. 1, Санкт-Петербург",
            # Тот же номер на другой улице.
            "Садовая ул., д. 9, Новоселье",
            # Та же улица и дом в другом посёлке.
            "Центральная ул., д. 3, д. Кудрово",
            # Без номера дома не понять, какой это дом.
            "Невская ул., Новоселье",
        ],
    )
    def test_other_house_goes_to_geocoder(self, db_session, book, raw_address):
        lat, lon, address_id = TaskService(db_session).resolve_coordinates(raw_address)

        assert address_id is None
        assert (lat, lon) == (1.0, 2.0)


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
        updated = service.update_status(
            task.id, "DONE", comment_text="Работы завершены", user=admin_user
        )

        assert updated.status == TaskStatus.DONE.value
        assert updated.completed_at is not None

    def test_done_requires_comment(self, db_session, admin_user):
        """Test DONE transition requires comment."""
        task = TaskModel(
            title="Task",
            raw_address="Addr",
            status=TaskStatus.IN_PROGRESS.value,
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()

        service = TaskService(db_session)

        with pytest.raises(CommentRequiredError) as exc_info:
            service.update_status(task.id, "DONE", comment_text="   ", user=admin_user)

        assert exc_info.value.status_code == 422

    def test_cancelled_requires_comment(self, db_session, admin_user):
        """Test CANCELLED transition requires comment."""
        task = TaskModel(
            title="Task",
            raw_address="Addr",
            status=TaskStatus.IN_PROGRESS.value,
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()

        service = TaskService(db_session)

        with pytest.raises(CommentRequiredError) as exc_info:
            service.update_status(
                task.id, "CANCELLED", comment_text="", user=admin_user
            )

        assert exc_info.value.status_code == 422


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
        from app.models.enums import TaskPriority
        from app.utils import PRIORITY_DISPLAY_NAMES

        assert PRIORITY_DISPLAY_NAMES[TaskPriority.PLANNED.value] == "Плановая"
        assert PRIORITY_DISPLAY_NAMES[TaskPriority.CURRENT.value] == "Текущая"
        assert PRIORITY_DISPLAY_NAMES[TaskPriority.URGENT.value] == "Срочная"
        assert PRIORITY_DISPLAY_NAMES[TaskPriority.EMERGENCY.value] == "Аварийная"


class TestTaskServiceDueAt:
    """Срок заявки: норматив приоритета или конец плановой даты."""

    @pytest.fixture
    def org_user(self, db_session, monkeypatch):
        monkeypatch.setattr(
            "app.services.task_service.geocoding_service.geocode",
            lambda _: (59.9, 30.3),
        )
        org = OrganizationModel(name="Due Org", slug="due-org", is_active=True)
        user = UserModel(
            username="due_dispatcher",
            password_hash=get_password_hash("test"),
            role=UserRole.DISPATCHER.value,
            is_active=True,
            organization=org,
        )
        db_session.add_all([org, user])
        db_session.commit()
        return user

    def _create(self, db_session, user, **fields):
        return TaskService(db_session).create(
            TaskCreate(
                title="Срок",
                address="Невская ул., д. 9",
                description="Проверка срока",
                **fields,
            ),
            user,
        )

    def test_priority_norm(self, db_session, org_user):
        task = self._create(db_session, org_user, priority="EMERGENCY")

        assert task.due_at - task.created_at == timedelta(hours=4)

    def test_planned_date_is_end_of_local_day(self, db_session, org_user):
        task = self._create(db_session, org_user, planned_date="2026-11-05")

        # Конец 5 ноября по Москве — 21:00 UTC.
        assert task.due_at == datetime(2026, 11, 5, 21, 0)

    def test_organization_norms(self, db_session, org_user):
        db_session.add(
            OrganizationSettingsModel(
                organization_id=org_user.organization_id,
                sla_hours={"EMERGENCY": 1, "URGENT": 2, "CURRENT": 3, "PLANNED": 4},
            )
        )
        db_session.commit()

        task = self._create(db_session, org_user, priority="URGENT")

        assert task.due_at - task.created_at == timedelta(hours=2)

    def test_recomputed_on_priority_and_date_changes(self, db_session, org_user):
        service = TaskService(db_session)
        task = self._create(db_session, org_user, priority="CURRENT")
        created = task.created_at

        service.admin_update_task(task.id, TaskUpdate(priority="EMERGENCY"), org_user)
        assert task.due_at - created == timedelta(hours=4)

        service.update_planned_date(task.id, datetime(2026, 11, 7), org_user)
        assert task.due_at == datetime(2026, 11, 7, 21, 0)

        service.update_planned_date(task.id, None, org_user)
        assert task.due_at - created == timedelta(hours=4)

    def test_overdue_counts_by_due_at(self, db_session, org_user):
        task = self._create(db_session, org_user, priority="PLANNED")
        task.due_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
            minutes=1
        )
        db_session.commit()

        metrics = get_sla_metrics(db_session, period="all", tenant_user=org_user)

        assert metrics["overview"]["active_overdue"] == 1


class TestOrgManagers:
    """Менеджеры организации — по base_access, с кастомными группами."""

    def test_custom_dispatcher_group_included(self, db_session):
        org = OrganizationModel(name="Managers Org", slug="managers-org")
        other = OrganizationModel(name="Other Org", slug="other-org")
        db_session.add_all([org, other])
        db_session.commit()
        db_session.add(
            UserGroupModel(
                name="senior",
                label="Старший мастер",
                base_access="dispatcher",
                is_system=False,
                organization_id=org.id,
            )
        )

        def user(username, role, organization, active=True):
            return UserModel(
                username=username,
                password_hash="x",
                role=role,
                is_active=active,
                organization_id=organization.id,
            )

        db_session.add_all(
            [
                user("m_admin", UserRole.ADMIN.value, org),
                user("m_dispatcher", UserRole.DISPATCHER.value, org),
                user("m_senior", "senior", org),
                user("m_worker", UserRole.WORKER.value, org),
                user("m_retired", UserRole.DISPATCHER.value, org, active=False),
                user("m_foreign", UserRole.DISPATCHER.value, other),
            ]
        )
        db_session.commit()

        managers = org_managers(db_session, org.id)

        assert {u.username for u in managers} == {
            "m_admin",
            "m_dispatcher",
            "m_senior",
        }
