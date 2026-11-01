"""Перенос обычных уведомлений на рабочее окно; аварийные без задержки."""

from datetime import datetime
from types import SimpleNamespace

from app.models import OrganizationModel
from app.models.outbox import OutboxEventModel
from app.models.sla_calendar import SlaCalendarModel
from app.services.sla_calendar import next_working_time
from app.services.sla_escalation import _Outbox
from tests.test_multitenant_isolation_api import _create_org_user, _login_headers


def test_weekend_and_holiday_are_skipped():
    calendar = SimpleNamespace(
        weekdays=[0, 1, 2, 3, 4],
        start_time="09:00",
        end_time="18:00",
        excluded_dates=["2026-11-02"],
    )
    # Воскресенье, затем исключённый понедельник: вторник 09:00 МСК.
    assert next_working_time(calendar, datetime(2026, 11, 1, 7)) == datetime(
        2026, 11, 3, 6
    )


def test_org_admin_can_only_edit_own_calendar(client, db_session):
    org = OrganizationModel(name="Один", slug="calendar-one")
    other = OrganizationModel(name="Два", slug="calendar-two")
    db_session.add_all([org, other])
    db_session.commit()
    admin = _create_org_user(
        db_session,
        username="calendar-admin",
        password="test",
        role="admin",
        organization_id=org.id,
    )
    headers = _login_headers(client, admin.username, "test")
    assert client.get("/api/sla-calendar", headers=headers).status_code == 200
    assert (
        client.get(
            f"/api/sla-calendar?organization_id={other.id}", headers=headers
        ).status_code
        == 403
    )
    assert (
        client.put(
            "/api/sla-calendar", headers=headers, json={"enabled": True, "weekdays": []}
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/sla-calendar", headers=headers, json={"enabled": True}
        ).status_code
        == 200
    )


def test_normal_alert_deferred_but_emergency_immediate(db_session):
    org = OrganizationModel(name="Рабочие часы", slug="calendar-delivery")
    db_session.add(org)
    db_session.commit()
    user = _create_org_user(
        db_session,
        username="calendar-worker",
        password="test",
        role="worker",
        organization_id=org.id,
    )
    db_session.add(SlaCalendarModel(organization_id=org.id, enabled=True))
    db_session.commit()
    outbox = _Outbox(now=datetime(2026, 11, 1, 7))
    outbox.notify(db_session, [user], "Обычная", "Напоминание")
    outbox.notify(db_session, [user], "Аварийная", "Срочно", emergency=True)
    db_session.commit()
    events = db_session.query(OutboxEventModel).filter_by(kind="push_send").all()
    by_title = {row.payload["title"]: row for row in events}
    assert by_title["Обычная"].available_at == datetime(2026, 11, 2, 6)
    assert by_title["Аварийная"].available_at != datetime(2026, 11, 2, 6)
