"""Фаза 5c: массовые регламенты ТО, сетка «регламент × месяц», отчёт за месяц."""

import io
from datetime import date

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.models import AddressModel, TaskModel
from app.models.operations import MaintenanceOccurrenceModel, MaintenancePlanModel
from app.services.maintenance_schedule import month_report, schedule
from app.services.maintenance_service import run_maintenance
from tests.test_acts import _org
from tests.test_counterparties import _counterparty


def _addresses(db_session, env, *names):
    rows = [AddressModel(address=name, organization_id=env.org.id) for name in names]
    db_session.add_all(rows)
    db_session.commit()
    return rows


PLAN = {
    "title": "ТО домофонии",
    "frequency": "monthly",
    "interval": 1,
    "start_date": "2026-01-10",
}


class TestBulk:
    def test_by_counterparty_skips_existing(self, client: TestClient, db_session):
        env = _org(client, db_session, "BulkCp")
        headers = env.dispatcher.headers
        first, second = _addresses(db_session, env, "Невская 9", "Невская 11")
        _addresses(db_session, env, "Чужой дом")
        counterparty = _counterparty(client, headers)
        client.put(
            f"/api/counterparties/{counterparty['id']}/addresses",
            json={"address_ids": [first.id, second.id]},
            headers=headers,
        )

        response = client.post(
            "/api/maintenance-plans/bulk",
            json={**PLAN, "counterparty_id": counterparty["id"]},
            headers=headers,
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"created": 2, "skipped": []}

        again = client.post(
            "/api/maintenance-plans/bulk",
            json={**PLAN, "address_ids": [first.id]},
            headers=headers,
        ).json()
        assert again == {"created": 0, "skipped": ["Невская 9"]}
        plans = db_session.query(MaintenancePlanModel).all()
        assert sorted(plan.address_id for plan in plans) == [first.id, second.id]
        assert {plan.next_date for plan in plans} == {date(2026, 1, 10)}

    def test_validation(self, client: TestClient, db_session):
        env = _org(client, db_session, "BulkBad")
        foreign = _org(client, db_session, "BulkForeign")
        [alien] = _addresses(db_session, foreign, "Чужой адрес")
        headers = env.dispatcher.headers

        assert (
            client.post(
                "/api/maintenance-plans/bulk", json=PLAN, headers=headers
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/maintenance-plans/bulk",
                json={**PLAN, "address_ids": [alien.id]},
                headers=headers,
            ).status_code
            == 404
        )
        assert (
            client.post(
                "/api/maintenance-plans/bulk",
                json={**PLAN, "address_ids": [alien.id]},
                headers=env.worker.headers,
            ).status_code
            == 403
        )


def _plan_with_history(client, db_session, name):
    """Регламент с 10-го числа: январь выполнен, февраль отменён, март открыт."""
    env = _org(client, db_session, name)
    [address] = _addresses(db_session, env, f"{name} дом")
    client.post(
        "/api/maintenance-plans/bulk",
        json={**PLAN, "address_ids": [address.id]},
        headers=env.dispatcher.headers,
    )
    run_maintenance(db_session, date(2026, 3, 15))
    occurrences = (
        db_session.query(MaintenanceOccurrenceModel)
        .order_by(MaintenanceOccurrenceModel.scheduled_date)
        .all()
    )
    assert [o.scheduled_date.month for o in occurrences] == [1, 2, 3]
    january, february, _ = (db_session.get(TaskModel, o.task_id) for o in occurrences)
    january.status = "DONE"
    february.status = "CANCELLED"
    db_session.commit()
    return env


class TestSchedule:
    def test_fact_and_forecast_by_month(self, client: TestClient, db_session):
        env = _plan_with_history(client, db_session, "Grid")

        data = schedule(
            db_session,
            env.dispatcher.user,
            date(2026, 1, 1),
            6,
            today=date(2026, 3, 20),
        )
        assert data["months"] == [
            "2026-01",
            "2026-02",
            "2026-03",
            "2026-04",
            "2026-05",
            "2026-06",
        ]
        [row] = data["rows"]
        cells = {cell["month"]: cell for cell in row["cells"]}
        assert cells["2026-01"] == {"month": "2026-01", "done": 1}
        assert cells["2026-02"] == {"month": "2026-02", "cancelled": 1}
        assert cells["2026-03"] == {"month": "2026-03", "overdue": 1}
        assert cells["2026-04"] == {"month": "2026-04", "planned": 1}
        assert data["totals"][5]["planned"] == 1

    def test_endpoint_and_filters(self, client: TestClient, db_session):
        env = _plan_with_history(client, db_session, "GridApi")
        response = client.get(
            "/api/maintenance/schedule?month_from=2026-01&months=3",
            headers=env.dispatcher.headers,
        )
        assert response.status_code == 200, response.text
        assert len(response.json()["rows"]) == 1
        filtered = client.get(
            "/api/maintenance/schedule?month_from=2026-01&months=3&counterparty_id=999",
            headers=env.dispatcher.headers,
        ).json()
        assert filtered["rows"] == []
        assert (
            client.get(
                "/api/maintenance/schedule?month_from=2026-01&months=13",
                headers=env.dispatcher.headers,
            ).status_code
            == 422
        )


class TestReport:
    def test_month_report(self, client: TestClient, db_session):
        env = _plan_with_history(client, db_session, "Report")
        content = month_report(
            db_session, env.dispatcher.user, "2026-01", today=date(2026, 3, 20)
        )
        book = load_workbook(io.BytesIO(content))
        visits = book["Выезды"]
        assert visits.cell(row=2, column=2).value == "ТО домофонии"
        assert visits.cell(row=2, column=7).value == "Выполнено"
        summary = book["По объектам"]
        assert summary.cell(row=2, column=3).value == 1
        assert summary.cell(row=2, column=8).value == 100

        response = client.get(
            "/api/maintenance/report.xlsx?month=2026-03", headers=env.dispatcher.headers
        )
        assert response.status_code == 200
        assert "attachment" in response.headers["content-disposition"]
