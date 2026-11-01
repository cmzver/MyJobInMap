"""Напоминания о сроках заявок и утренний дайджест просрочки."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.models import (
    NotificationModel,
    OrganizationModel,
    OrganizationSettingsModel,
    TaskModel,
    TaskStatus,
    UserRole,
    init_default_settings,
)
from app.services import sla_escalation
from app.services.sla_escalation import (
    DUE_SOON,
    NOT_STARTED,
    NOT_STARTED_MANAGERS,
    OVERDUE,
    UNASSIGNED,
    firing_rules,
    run_overdue_digest,
    run_sla_tick,
)
from tests.test_multitenant_isolation_api import _create_org_user, _login_headers

# 10:00 по Москве: не тихие часы и окно утреннего дайджеста.
NOW = datetime(2026, 11, 2, 7, 0)


def _task(**fields):
    values = {
        "status": TaskStatus.NEW.value,
        "priority": "CURRENT",
        "created_at": NOW - timedelta(minutes=5),
        "assigned_user_id": None,
        "due_at": None,
    }
    values.update(fields)
    return SimpleNamespace(**values)


class TestFiringRules:
    def test_unassigned_after_threshold(self):
        def rules(minutes):
            task = _task(
                priority="EMERGENCY", created_at=NOW - timedelta(minutes=minutes)
            )
            return firing_rules(task, NOW, 4)

        assert UNASSIGNED not in rules(10)
        assert UNASSIGNED in rules(16)

    def test_not_started_goes_to_managers_later(self):
        def rules(minutes):
            task = _task(
                priority="URGENT",
                assigned_user_id=1,
                created_at=NOW - timedelta(minutes=minutes),
            )
            return firing_rules(task, NOW, 8)

        assert rules(50) == []
        assert rules(61) == [NOT_STARTED]
        assert rules(121) == [NOT_STARTED, NOT_STARTED_MANAGERS]

    def test_planned_priority_has_no_start_rules(self):
        task = _task(priority="PLANNED", created_at=NOW - timedelta(hours=5))

        assert firing_rules(task, NOW, 168) == []

    def test_due_soon_is_quarter_of_norm(self):
        # Текущая: норматив 48 ч → напоминание за 12 ч.
        assert firing_rules(_task(due_at=NOW + timedelta(hours=11)), NOW, 48) == [
            DUE_SOON
        ]
        assert firing_rules(_task(due_at=NOW + timedelta(hours=13)), NOW, 48) == []

    def test_due_soon_lead_is_clamped(self):
        # Аварийная: четверть от 4 ч меньше часа → за 1 ч.
        assert firing_rules(_task(due_at=NOW + timedelta(minutes=50)), NOW, 4) == [
            DUE_SOON
        ]
        # Плановая: четверть от 168 ч больше суток → за 24 ч.
        assert firing_rules(_task(due_at=NOW + timedelta(hours=30)), NOW, 168) == []

    def test_overdue_only_fresh(self):
        assert firing_rules(_task(due_at=NOW - timedelta(hours=2)), NOW, 48) == [
            OVERDUE
        ]
        assert firing_rules(_task(due_at=NOW - timedelta(hours=30)), NOW, 48) == []


@pytest.fixture
def pushes(monkeypatch):
    sent = []
    monkeypatch.setattr(
        sla_escalation,
        "send_push_notification",
        lambda **kwargs: sent.append(("fcm", kwargs)),
    )
    monkeypatch.setattr(
        sla_escalation,
        "send_web_push",
        lambda **kwargs: sent.append(("web", kwargs)),
    )
    return sent


@pytest.fixture
def org(db_session):
    init_default_settings(db_session)
    org = OrganizationModel(name="Sla Org", slug="sla-org", is_active=True)
    db_session.add(org)
    db_session.commit()
    dispatcher = _create_org_user(
        db_session,
        username="sla-disp",
        password="pass123",
        role=UserRole.DISPATCHER.value,
        organization_id=org.id,
    )
    worker = _create_org_user(
        db_session,
        username="sla-worker",
        password="pass123",
        role=UserRole.WORKER.value,
        organization_id=org.id,
    )
    return SimpleNamespace(id=org.id, dispatcher=dispatcher, worker=worker)


def _add_task(db_session, organization_id, **fields):
    values = {
        "title": "Не работает домофон",
        "raw_address": "ул. Невская, д. 9",
        "description": "",
        "status": TaskStatus.NEW.value,
        "priority": "CURRENT",
        "created_at": NOW - timedelta(hours=1),
        "organization_id": organization_id,
    }
    values.update(fields)
    task = TaskModel(**values)
    db_session.add(task)
    db_session.commit()
    return task


def _inbox(db_session, user):
    return [
        (n.title, n.task_id)
        for n in db_session.query(NotificationModel)
        .filter(NotificationModel.user_id == user.id)
        .order_by(NotificationModel.id)
    ]


class TestSlaTick:
    def test_due_soon_reaches_assignee_and_managers_once(self, db_session, org, pushes):
        task = _add_task(
            db_session,
            org.id,
            status=TaskStatus.IN_PROGRESS.value,
            assigned_user_id=org.worker.id,
            due_at=NOW + timedelta(hours=3),
        )

        payloads = run_sla_tick(db_session, NOW)
        run_sla_tick(db_session, NOW + timedelta(minutes=5))

        assert _inbox(db_session, org.worker) == [("⏳ Скоро срок заявки", task.id)]
        assert _inbox(db_session, org.dispatcher) == [("⏳ Скоро срок заявки", task.id)]
        assert {user_id for user_id, _ in payloads} == {
            org.worker.id,
            org.dispatcher.id,
        }
        assert [kind for kind, _ in pushes] == ["fcm", "web"]
        assert pushes[1][1]["url"] == f"/tasks/{task.id}"

    def test_rescheduled_due_reminds_again(self, db_session, org, pushes):
        task = _add_task(
            db_session,
            org.id,
            assigned_user_id=org.worker.id,
            due_at=NOW + timedelta(hours=3),
        )
        run_sla_tick(db_session, NOW)

        task.due_at = NOW + timedelta(hours=5)
        db_session.commit()
        run_sla_tick(db_session, NOW + timedelta(minutes=5))

        assert len(_inbox(db_session, org.worker)) == 2

    def test_overdue_and_unassigned_go_to_managers(self, db_session, org, pushes):
        overdue = _add_task(
            db_session,
            org.id,
            assigned_user_id=org.worker.id,
            status=TaskStatus.IN_PROGRESS.value,
            due_at=NOW - timedelta(minutes=10),
        )
        unassigned = _add_task(
            db_session,
            org.id,
            priority="EMERGENCY",
            created_at=NOW - timedelta(minutes=20),
            due_at=NOW + timedelta(hours=3, minutes=40),
        )

        run_sla_tick(db_session, NOW)

        assert _inbox(db_session, org.dispatcher) == [
            ("🔥 Заявка просрочена", overdue.id),
            ("⏰ Заявка без исполнителя", unassigned.id),
        ]
        assert _inbox(db_session, org.worker) == []

    def test_quiet_hours_mute_pushes_except_emergency(self, db_session, org, pushes):
        night = datetime(2026, 11, 2, 21, 0)  # 00:00 по Москве
        _add_task(
            db_session,
            org.id,
            assigned_user_id=org.worker.id,
            created_at=night - timedelta(hours=1),
            due_at=night + timedelta(hours=3),
        )
        _add_task(
            db_session,
            org.id,
            priority="EMERGENCY",
            created_at=night - timedelta(minutes=20),
            due_at=night + timedelta(hours=3, minutes=40),
        )

        run_sla_tick(db_session, night)

        # In-app — всем, пуши — только по аварийной.
        assert len(_inbox(db_session, org.worker)) == 1
        assert len(_inbox(db_session, org.dispatcher)) == 2
        assert [kwargs["title"] for _, kwargs in pushes] == [
            "⏰ Заявка без исполнителя"
        ] * 2

    def test_disabled_and_closed_are_skipped(self, db_session, org, pushes):
        other = OrganizationModel(name="Quiet Org", slug="quiet-org", is_active=True)
        db_session.add(other)
        db_session.commit()
        db_session.add(
            OrganizationSettingsModel(
                organization_id=other.id, sla_escalations_enabled=False
            )
        )
        db_session.commit()
        _add_task(db_session, other.id, due_at=NOW - timedelta(minutes=10))
        _add_task(
            db_session,
            org.id,
            status=TaskStatus.DONE.value,
            due_at=NOW - timedelta(minutes=10),
        )

        assert run_sla_tick(db_session, NOW) == []


class TestOverdueDigest:
    def test_once_per_morning(self, db_session, org, pushes):
        _add_task(db_session, org.id, due_at=NOW - timedelta(days=3))
        _add_task(db_session, org.id, due_at=NOW - timedelta(hours=1))

        run_overdue_digest(db_session, NOW)
        run_overdue_digest(db_session, NOW + timedelta(minutes=30))

        assert _inbox(db_session, org.dispatcher) == [("🔥 Просрочено заявок: 2", None)]
        assert pushes[1][1]["url"] == "/tasks?due=overdue"

    def test_not_outside_morning_window(self, db_session, org, pushes):
        _add_task(db_session, org.id, due_at=NOW - timedelta(days=3))

        afternoon = datetime(2026, 11, 2, 11, 0)  # 14:00 по Москве

        assert run_overdue_digest(db_session, afternoon) == []


class TestDueFilter:
    def test_list_filters_and_sorts_by_due(self, client: TestClient, db_session, org):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        overdue = _add_task(
            db_session, org.id, created_at=now, due_at=now - timedelta(hours=2)
        )
        soon = _add_task(
            db_session, org.id, created_at=now, due_at=now + timedelta(hours=2)
        )
        later = _add_task(
            db_session, org.id, created_at=now, due_at=now + timedelta(days=3)
        )
        headers = _login_headers(client, "sla-disp", "pass123")

        def ids(**params):
            response = client.get("/api/tasks", params=params, headers=headers)
            assert response.status_code == 200
            return [task["id"] for task in response.json()["items"]]

        assert ids(due="overdue") == [overdue.id]
        assert ids(due="soon") == [soon.id]
        assert ids(sort="due_at_asc") == [overdue.id, soon.id, later.id]
