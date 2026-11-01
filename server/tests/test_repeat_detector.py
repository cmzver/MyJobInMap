"""Повторные заявки: место заявки, история адреса и ручные отметки повтора/дубля."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.models import (
    CommentModel,
    OrganizationModel,
    TaskModel,
    TaskStatus,
    UserModel,
    UserRole,
    init_default_settings,
)
from app.schemas import TaskCreate, TaskUpdate
from app.services.auth import get_password_hash
from app.services.repeat_detector import DUPLICATE, RETURN, address_key, mark_repeat
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


def _closed(db_session, organization_id, raw_address=PLACE, days=2, **fields):
    """Заявка, закрытая days дней назад."""
    return _existing(
        db_session,
        organization_id,
        raw_address,
        status=TaskStatus.DONE.value,
        created_at=_now() - timedelta(days=days + 1),
        completed_at=_now() - timedelta(days=days),
        **fields,
    )


def _create(db_session, user, address=PLACE, **fields):
    task = TaskService(db_session).create(
        TaskCreate(title="Новая", address=address, description="", **fields), user
    )
    db_session.commit()
    return task


class TestNoAutomaticMarks:
    def test_new_task_on_busy_place_is_not_marked(self, db_session, dispatcher):
        """В одном доме — разные квартиры и поломки: автоматика не размечает."""
        _existing(db_session, dispatcher.organization_id)
        _closed(db_session, dispatcher.organization_id, defect_type="Брелок")

        task = _create(
            db_session, dispatcher, address="Невская 9", defect_type="Брелок"
        )

        assert task.address_key == address_key(PLACE)
        assert task.repeat_kind is None

    def test_address_change_updates_place_and_keeps_manual_mark(
        self, db_session, dispatcher
    ):
        original = _closed(db_session, dispatcher.organization_id)
        task = _create(db_session, dispatcher, address="ул. Садовая, д. 1")
        mark_repeat(db_session, task, original, RETURN)
        db_session.commit()

        updated = TaskService(db_session).admin_update_task(
            task.id, TaskUpdate(address=PLACE), dispatcher
        )

        assert updated.address_key == address_key(PLACE)
        assert (updated.repeat_of_task_id, updated.repeat_kind) == (
            original.id,
            RETURN,
        )

    def test_repeat_ref_shows_who_closed_and_how(self, db_session, dispatcher):
        worker = _create_org_user(
            db_session,
            username="repeat_worker",
            password="pass",
            role=UserRole.WORKER.value,
            organization_id=dispatcher.organization_id,
        )
        original = _closed(
            db_session,
            dispatcher.organization_id,
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
        mark_repeat(db_session, task, original, RETURN)
        db_session.commit()

        ref = task_to_response(task).repeat_of

        assert (ref.id, ref.kind, ref.same_defect) == (original.id, RETURN, True)
        assert ref.assigned_user_name == "repeat_worker"
        assert ref.completion_comment == "Заменил блок питания"


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


def _mark(client, headers, task_id, original_id, kind="duplicate"):
    return client.put(
        f"/api/tasks/{task_id}/repeat-of",
        json={"original_task_id": original_id, "kind": kind},
        headers=headers,
    )


class TestManualMarks:
    def test_duplicate_mark_and_unmark_with_history(
        self, client: TestClient, db_session
    ):
        org, _, headers, _ = _org_client(client, db_session, "DupOrg")
        original = _existing(db_session, org.id, task_number="Z-00101")
        task = _existing(db_session, org.id, created_at=_now())

        marked = _mark(client, headers, task.id, original.id)

        assert marked.status_code == 200
        assert marked.json()["repeat_of"]["id"] == original.id
        assert marked.json()["repeat_of"]["kind"] == DUPLICATE
        assert marked.json()["comments"][-1]["text"] == (
            "Отмечена как дубль заявки №Z-00101"
        )

        cleared = _mark(client, headers, task.id, None).json()

        assert cleared["repeat_of"] is None
        assert cleared["comments"][-1]["text"] == (
            "Снята отметка «дубль заявки №Z-00101»"
        )

    def test_return_only_for_done_task(self, client: TestClient, db_session):
        org, _, headers, _ = _org_client(client, db_session, "RetOrg")
        still_open = _existing(db_session, org.id)
        done = _closed(db_session, org.id, task_number="Z-00202")
        task = _existing(db_session, org.id, created_at=_now())

        rejected = _mark(client, headers, task.id, still_open.id, RETURN)
        marked = _mark(client, headers, task.id, done.id, RETURN)

        assert rejected.status_code == 400
        assert marked.json()["repeat_of"]["kind"] == RETURN
        assert marked.json()["comments"][-1]["text"] == (
            "Отмечена как повтор заявки №Z-00202"
        )

    def test_no_duplicate_chains(self, client: TestClient, db_session):
        org, _, headers, _ = _org_client(client, db_session, "ChainOrg")
        root = _existing(db_session, org.id)
        middle = _existing(db_session, org.id)
        child = _existing(db_session, org.id)
        _mark(client, headers, child.id, middle.id)

        # Дубли заявки переезжают вместе с ней, дубль дубля — на исходную.
        _mark(client, headers, middle.id, root.id)
        db_session.expire_all()
        assert db_session.get(TaskModel, child.id).repeat_of_task_id == root.id

        other = _existing(db_session, org.id)
        response = _mark(client, headers, other.id, middle.id)
        assert response.json()["repeat_of"]["id"] == root.id

    def test_rejects_self_other_org_and_workers(self, client: TestClient, db_session):
        org, worker, headers, worker_headers = _org_client(client, db_session, "RejOrg")
        other, *_ = _org_client(client, db_session, "RejOther")
        task = _existing(db_session, org.id, assigned_user_id=worker.id)
        foreign = _existing(db_session, other.id)
        original = _existing(db_session, org.id)

        assert _mark(client, headers, task.id, task.id).status_code == 400
        assert _mark(client, headers, task.id, foreign.id).status_code == 404
        assert _mark(client, worker_headers, task.id, original.id).status_code == 403


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

    def test_related_other_city_is_other_place(self, client: TestClient, db_session):
        org, _, headers, _ = _org_client(client, db_session, "CityOrg")
        _closed(db_session, org.id, "Кудрово, ул. Невская, д. 9")

        data = client.get(
            "/api/tasks/related",
            params={"address": "гп. Новоселье, ул. Невская, д. 9"},
            headers=headers,
        ).json()

        assert data["history"] == []

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

    def test_list_filter_by_mark(self, client: TestClient, db_session):
        org, _, headers, _ = _org_client(client, db_session, "ListOrg")
        original = _closed(db_session, org.id)
        task = _existing(db_session, org.id, created_at=_now())
        _mark(client, headers, task.id, original.id, RETURN)

        response = client.get(
            "/api/tasks", params={"repeat_kind": "return"}, headers=headers
        )

        assert [t["id"] for t in response.json()["items"]] == [task.id]
        assert response.json()["items"][0]["repeat_of"]["task_number"]

    def test_repeat_metrics(self, client: TestClient, db_session):
        org, worker, headers, _ = _org_client(client, db_session, "MetOrg")
        returned = _existing(
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
        again = _existing(db_session, org.id, created_at=_now())
        _mark(client, headers, again.id, returned.id, RETURN)

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
