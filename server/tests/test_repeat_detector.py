"""Повторные заявки: дубль открытой заявки и возврат после недавнего закрытия."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.models import (
    AddressModel,
    CommentModel,
    OrganizationModel,
    OrganizationSettingsModel,
    TaskModel,
    TaskStatus,
    UserModel,
    UserRole,
    init_default_settings,
)
from app.models.address import AddressSystemModel
from app.schemas import TaskCreate, TaskUpdate
from app.services.auth import get_password_hash
from app.services.repeat_detector import DUPLICATE, RETURN, address_key, pick_repeat
from app.services.task_service import TaskService
from app.utils import task_to_response
from tests.test_multitenant_isolation_api import _create_org_user, _login_headers

PLACE = "ул. Невская, д. 9"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


class TestAddressKey:
    def test_same_house_written_differently(self):
        keys = {
            address_key(PLACE),
            address_key("Невская 9"),
            address_key("Санкт-Петербург, Невская улица, дом 9"),
            address_key("Невская, д. 9, Новоселье"),
        }

        assert len(keys) == 1 and None not in keys

    def test_other_house_or_litera_is_other_place(self):
        assert address_key("Невская 9а") != address_key(PLACE)
        assert address_key("Невская 19") != address_key(PLACE)

    def test_unparsed_address_has_no_key(self):
        assert address_key("где-то во дворе") is None


class TestPickRepeat:
    """Чистый расчёт — им же размечается история в миграции."""

    def _row(self, task_id, created_at, **fields):
        values = {
            "raw_address": PLACE,
            "address_id": None,
            "system_id": None,
            "system_type": None,
            "defect_type": None,
            "status": TaskStatus.NEW.value,
            "completed_at": None,
            **fields,
        }
        row = SimpleNamespace(id=task_id, created_at=created_at, **values)
        row.address_key = address_key(row.raw_address)
        return row

    def test_same_moment_resolved_by_id(self):
        moment = _now()
        first, second = self._row(1, moment), self._row(2, moment)

        assert pick_repeat(second, [first, second], 30) == (first, DUPLICATE)
        assert pick_repeat(first, [first, second], 30) is None

    def test_task_open_at_creation_is_duplicate_even_if_closed_later(self):
        moment = _now()
        original = self._row(
            1,
            moment - timedelta(days=2),
            status=TaskStatus.DONE.value,
            completed_at=moment + timedelta(days=1),
        )

        assert pick_repeat(self._row(2, moment), [original], 30) == (
            original,
            DUPLICATE,
        )


@pytest.fixture
def dispatcher(db_session, monkeypatch):
    monkeypatch.setattr(
        "app.services.task_service.geocoding_service.geocode",
        lambda _: (59.9, 30.3),
    )
    org = OrganizationModel(name="Repeat Org", slug="repeat-org", is_active=True)
    user = UserModel(
        username="repeat_dispatcher",
        password_hash=get_password_hash("test"),
        role=UserRole.DISPATCHER.value,
        is_active=True,
        organization=org,
    )
    db_session.add_all([org, user])
    db_session.commit()
    return user


def _existing(db_session, organization_id, raw_address=PLACE, **fields):
    """Заявка из прошлого: время и статус задаём сами."""
    fields.setdefault("status", TaskStatus.NEW.value)
    fields.setdefault("created_at", _now() - timedelta(days=3))
    task = TaskModel(
        title="Прошлая",
        raw_address=raw_address,
        description="",
        organization_id=organization_id,
        address_key=address_key(raw_address),
        **fields,
    )
    db_session.add(task)
    db_session.commit()
    return task


def _create(db_session, user, address=PLACE, **fields):
    task = TaskService(db_session).create(
        TaskCreate(title="Новая", address=address, description="", **fields), user
    )
    db_session.commit()
    return task


class TestApplyRepeat:
    def test_open_task_on_same_place_is_duplicate(self, db_session, dispatcher):
        original = _existing(db_session, dispatcher.organization_id)

        task = _create(db_session, dispatcher, address="Невская 9")

        assert task.address_key == address_key(PLACE)
        assert (task.repeat_of_task_id, task.repeat_kind) == (original.id, DUPLICATE)

    def test_recently_closed_is_return_with_completion_comment(
        self, db_session, dispatcher
    ):
        worker = _create_org_user(
            db_session,
            username="repeat_worker",
            password="pass",
            role=UserRole.WORKER.value,
            organization_id=dispatcher.organization_id,
        )
        original = _existing(
            db_session,
            dispatcher.organization_id,
            status=TaskStatus.DONE.value,
            created_at=_now() - timedelta(days=12),
            completed_at=_now() - timedelta(days=10),
            assigned_user_id=worker.id,
            defect_type="Не работает домофон",
        )
        db_session.add(
            CommentModel(
                task_id=original.id,
                text="Заменил блок питания",
                old_status="IN_PROGRESS",
                new_status="DONE",
            )
        )
        db_session.commit()

        task = _create(db_session, dispatcher, defect_type="Не работает домофон")
        ref = task_to_response(task).repeat_of

        assert ref is not None
        assert (ref.id, ref.kind) == (original.id, RETURN)
        assert ref.same_defect is True
        assert ref.assigned_user_name == "repeat_worker"
        assert ref.completion_comment == "Заменил блок питания"

    def test_closed_before_window_is_not_repeat(self, db_session, dispatcher):
        _existing(
            db_session,
            dispatcher.organization_id,
            status=TaskStatus.DONE.value,
            created_at=_now() - timedelta(days=45),
            completed_at=_now() - timedelta(days=40),
        )

        first = _create(db_session, dispatcher)
        assert first.repeat_kind is None
        first.status = "CANCELLED"

        db_session.add(
            OrganizationSettingsModel(
                organization_id=dispatcher.organization_id, repeat_window_days=60
            )
        )
        db_session.commit()

        assert _create(db_session, dispatcher).repeat_kind == RETURN

    def test_cancelled_and_other_org_are_ignored(self, db_session, dispatcher):
        other_org = OrganizationModel(name="Other", slug="other", is_active=True)
        db_session.add(other_org)
        db_session.commit()
        _existing(db_session, dispatcher.organization_id, status="CANCELLED")
        _existing(db_session, other_org.id)

        assert _create(db_session, dispatcher).repeat_kind is None

    def test_other_city_is_other_place(self, db_session, dispatcher):
        _existing(db_session, dispatcher.organization_id, "Кудрово, ул. Невская, д. 9")

        task = _create(
            db_session, dispatcher, address="гп. Новоселье, ул. Невская, д. 9"
        )

        assert task.repeat_kind is None

    def test_system_must_match_unless_unknown(self, db_session, dispatcher):
        book = AddressModel(
            address="Другой дом",
            organization_id=dispatcher.organization_id,
        )
        db_session.add(book)
        db_session.commit()
        intercom = AddressSystemModel(
            address_id=book.id, system_type="intercom", name="Домофон"
        )
        cameras = AddressSystemModel(
            address_id=book.id, system_type="video_surveillance", name="Камеры"
        )
        db_session.add_all([intercom, cameras])
        db_session.commit()
        original = _existing(
            db_session, dispatcher.organization_id, system_id=intercom.id
        )

        assert _create(db_session, dispatcher, system_id=cameras.id).repeat_kind is None
        assert _create(db_session, dispatcher).repeat_of_task_id == original.id

    def test_address_book_link_matches_differently_written_address(
        self, db_session, dispatcher
    ):
        book = AddressModel(
            address="Невская ул., д. 9",
            street="Невская ул.",
            building="9",
            lat=59.95,
            lon=30.45,
            organization_id=dispatcher.organization_id,
            is_active=True,
        )
        db_session.add(book)
        db_session.commit()
        original = _existing(
            db_session,
            dispatcher.organization_id,
            "ЖК «Невский», парадная 2",
            address_id=book.id,
        )

        task = _create(db_session, dispatcher, address="Невская ул., д. 9")

        assert task.address_id == book.id
        assert task.repeat_of_task_id == original.id

    def test_duplicate_wins_and_same_defect_first(self, db_session, dispatcher):
        org_id = dispatcher.organization_id
        _existing(
            db_session,
            org_id,
            status=TaskStatus.DONE.value,
            completed_at=_now() - timedelta(days=1),
            defect_type="Брелок",
        )
        _existing(db_session, org_id, created_at=_now() - timedelta(days=5))
        same_defect = _existing(db_session, org_id, defect_type="Брелок")

        task = _create(db_session, dispatcher, defect_type="брелок")

        assert (task.repeat_of_task_id, task.repeat_kind) == (
            same_defect.id,
            DUPLICATE,
        )

    def test_address_change_recomputes_repeat(self, db_session, dispatcher):
        original = _existing(db_session, dispatcher.organization_id)
        task = _create(db_session, dispatcher, address="ул. Садовая, д. 1")
        assert task.repeat_kind is None

        updated = TaskService(db_session).admin_update_task(
            task.id, TaskUpdate(address=PLACE), dispatcher
        )

        assert (updated.repeat_of_task_id, updated.repeat_kind) == (
            original.id,
            DUPLICATE,
        )


def _org_client(client: TestClient, db_session, name: str):
    init_default_settings(db_session)
    org = OrganizationModel(name=name, slug=name.lower(), is_active=True)
    db_session.add(org)
    db_session.commit()
    dispatcher = _create_org_user(
        db_session,
        username=f"{name.lower()}-disp",
        password="pass123",
        role=UserRole.DISPATCHER.value,
        organization_id=org.id,
    )
    worker = _create_org_user(
        db_session,
        username=f"{name.lower()}-worker",
        password="pass123",
        role=UserRole.WORKER.value,
        organization_id=org.id,
    )
    return (
        org,
        worker,
        _login_headers(client, dispatcher.username, "pass123"),
        _login_headers(client, worker.username, "pass123"),
    )


class TestRepeatApi:
    def test_related_for_draft_and_for_task(self, client: TestClient, db_session):
        org, worker, headers, _ = _org_client(client, db_session, "RelOrg")
        open_task = _existing(db_session, org.id, assigned_user_id=worker.id)
        closed = _existing(
            db_session,
            org.id,
            status=TaskStatus.DONE.value,
            created_at=_now() - timedelta(days=9),
            completed_at=_now() - timedelta(days=8),
        )
        _existing(db_session, org.id, "ул. Садовая, д. 1")

        response = client.get(
            "/api/tasks/related", params={"address": "Невская 9"}, headers=headers
        )

        assert response.status_code == 200
        data = response.json()
        assert [t["id"] for t in data["open_tasks"]] == [open_task.id]
        assert [t["id"] for t in data["recently_closed"]] == [closed.id]
        assert [t["id"] for t in data["history"]] == [open_task.id, closed.id]
        assert data["window_days"] == 30

        by_task = client.get(
            "/api/tasks/related", params={"task_id": open_task.id}, headers=headers
        ).json()
        assert [t["id"] for t in by_task["history"]] == [closed.id]

    def test_related_worker_sees_only_own_tasks(self, client: TestClient, db_session):
        org, worker, _, worker_headers = _org_client(client, db_session, "WrkOrg")
        own = _existing(db_session, org.id, assigned_user_id=worker.id)
        _existing(db_session, org.id)

        data = client.get(
            "/api/tasks/related", params={"address": PLACE}, headers=worker_headers
        ).json()

        assert [t["id"] for t in data["open_tasks"]] == [own.id]

    def test_related_requires_task_or_address(self, client: TestClient, db_session):
        _, _, headers, _ = _org_client(client, db_session, "BadOrg")

        assert client.get("/api/tasks/related", headers=headers).status_code == 400

    def test_list_filter_and_repeat_ref(self, client: TestClient, db_session):
        org, _, headers, _ = _org_client(client, db_session, "ListOrg")
        original = _existing(db_session, org.id)
        created = client.post(
            "/api/tasks",
            json={"title": "Дубль", "address": "Невская 9", "description": ""},
            headers=headers,
        ).json()
        assert created["repeat_of"]["id"] == original.id
        assert created["repeat_of"]["kind"] == DUPLICATE

        response = client.get(
            "/api/tasks", params={"repeat_kind": "duplicate"}, headers=headers
        )

        assert [t["id"] for t in response.json()["items"]] == [created["id"]]
        assert response.json()["items"][0]["repeat_of"]["task_number"]

    def test_repeat_metrics(self, client: TestClient, db_session):
        org, worker, headers, _ = _org_client(client, db_session, "MetOrg")
        _existing(
            db_session,
            org.id,
            status=TaskStatus.DONE.value,
            created_at=_now() - timedelta(hours=5),
            completed_at=_now() - timedelta(hours=4),
            assigned_user_id=worker.id,
        )
        _existing(
            db_session,
            org.id,
            "ул. Садовая, д. 1",
            status=TaskStatus.DONE.value,
            created_at=_now() - timedelta(hours=5),
            completed_at=_now() - timedelta(hours=4),
            assigned_user_id=worker.id,
        )
        client.post(
            "/api/tasks",
            json={"title": "Снова", "address": PLACE, "description": ""},
            headers=headers,
        )

        response = client.get(
            "/api/analytics/repeats", params={"period": "all"}, headers=headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["overview"]["returns"] == 1
        assert data["overview"]["return_rate"] == 50.0
        assert data["by_worker"] == [
            {
                "user_id": worker.id,
                "user_name": worker.username,
                "completed": 2,
                "returned": 1,
                "return_rate": 50.0,
            }
        ]
        assert data["top_addresses"][0]["tasks"] == 2
        assert data["top_addresses"][0]["returns"] == 1

    def test_repeat_window_in_organization_settings(
        self, client: TestClient, db_session
    ):
        org = OrganizationModel(name="WinOrg", slug="winorg", is_active=True)
        db_session.add(org)
        db_session.commit()
        admin = _create_org_user(
            db_session,
            username="winorg-admin",
            password="pass123",
            role=UserRole.ADMIN.value,
            organization_id=org.id,
        )
        headers = _login_headers(client, admin.username, "pass123")
        url = "/api/admin/organization-settings"

        assert client.get(url, headers=headers).json()["repeat_window_days"] == 30
        assert (
            client.put(url, json={"repeat_window_days": 0}, headers=headers).status_code
            == 422
        )
        saved = client.put(url, json={"repeat_window_days": 14}, headers=headers)
        assert saved.json()["repeat_window_days"] == 14
