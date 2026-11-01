"""Сквозные проверки новых рабочих сценариев и границ доступа."""

from datetime import date, datetime

import pytest

from app.models import (
    AddressEquipmentModel,
    AddressModel,
    TaskModel,
    init_default_settings,
)
from app.models.operations import MaintenanceOccurrenceModel, MaintenancePlanModel
from app.services.maintenance_service import following_date, run_maintenance


@pytest.fixture(autouse=True)
def permissions(db_session):
    init_default_settings(db_session)


def task(db, **extra):
    row = TaskModel(title="Работа", raw_address="Ленина, 1", **extra)
    db.add(row)
    db.commit()
    return row


def test_dispatch_counts_every_page_and_filters(
    client, auth_headers, db_session, worker_user
):
    db_session.add_all(
        [
            TaskModel(
                title="Нужная",
                raw_address="Ленина, 1",
                priority="URGENT",
                assigned_user_id=worker_user.id,
            )
            for _ in range(105)
        ]
    )
    db_session.commit()
    task(db_session, status="DONE")
    data = client.get(
        "/api/tasks/dispatch?status=NEW&search=Нужная", headers=auth_headers
    ).json()
    assert data["total"] == 105
    assert data["rows"][0]["urgent"] == 105
    unassigned = client.get("/api/tasks?unassigned=true", headers=auth_headers).json()
    assert unassigned["total"] == 1
    assert unassigned["items"][0]["assigned_user_id"] is None


def test_worker_dispatch_cannot_escape_scope(
    client_with_worker, db_session, worker_user
):
    task(db_session, assigned_user_id=worker_user.id)
    task(db_session)
    data = client_with_worker.get("/api/tasks/dispatch?unassigned=true").json()
    assert data["total"] == 1
    assert data["rows"][0]["assigneeId"] == worker_user.id


def test_views_import_once_and_enforce_personal_visibility(
    client, auth_headers, client_with_worker
):
    payload = {
        "name": "Аварийные",
        "source_id": "local-1",
        "settings": {"assignees": ["unassigned"], "due": "overdue"},
    }
    first = client.post("/api/task-views", json=payload, headers=auth_headers)
    assert first.status_code == 200, first.text
    second = client.post("/api/task-views", json=payload, headers=auth_headers)
    assert first.json()["id"] == second.json()["id"]
    assert client_with_worker.get("/api/task-views").json() == []
    assert (
        client_with_worker.post(
            "/api/task-views", json={**payload, "shared": True}
        ).status_code
        == 403
    )
    shared = client.post(
        "/api/task-views",
        json={**payload, "source_id": None, "shared": True},
        headers=auth_headers,
    ).json()
    assert client_with_worker.get("/api/task-views").json()[0]["can_edit"] is False
    assert (
        client_with_worker.delete(f'/api/task-views/{shared["id"]}').status_code == 403
    )


def test_my_day_orders_only_own_open_tasks(client_with_worker, db_session, worker_user):
    one = task(db_session, assigned_user_id=worker_user.id)
    two = task(
        db_session,
        assigned_user_id=worker_user.id,
        planned_date=datetime(2026, 10, 31, 9),
    )
    other = task(db_session)
    task(
        db_session,
        assigned_user_id=worker_user.id,
        planned_date=datetime(2026, 11, 3, 9),
    )
    assert (
        client_with_worker.put(
            "/api/my-day?day=2026-11-01", json={"task_ids": [one.id, other.id]}
        ).status_code
        == 409
    )
    assert (
        client_with_worker.put(
            "/api/my-day?day=2026-11-01", json={"task_ids": [one.id, two.id]}
        ).status_code
        == 200
    )
    items = client_with_worker.get("/api/my-day?day=2026-11-01").json()["tasks"]
    assert [item["id"] for item in items] == [one.id, two.id]


def test_maintenance_month_end_exclusions_and_dedup(
    client, auth_headers, db_session, admin_user
):
    address = AddressModel(address="Ленина, 1")
    db_session.add(address)
    db_session.commit()
    response = client.post(
        "/api/maintenance-plans",
        headers=auth_headers,
        json={
            "title": "Профилактика",
            "address_id": address.id,
            "frequency": "monthly",
            "start_date": "2026-01-31",
            "end_date": "2026-04-30",
            "excluded_dates": ["2026-02-28"],
        },
    )
    assert response.status_code == 200, response.text
    plan = db_session.get(MaintenancePlanModel, response.json()["id"])
    assert following_date(plan, date(2026, 2, 28)) == date(2026, 3, 31)
    created = run_maintenance(db_session, date(2026, 3, 31))
    assert len(created) == 2
    assert run_maintenance(db_session, date(2026, 3, 31)) == []
    assert db_session.query(MaintenanceOccurrenceModel).count() == 2
    assert plan.next_date == date(2026, 4, 30)


def test_material_stock_cannot_overdraw_and_request_retry_is_safe(
    client, auth_headers, db_session, admin_user
):
    row = task(db_session, assigned_user_id=admin_user.id)
    material = client.post(
        "/api/materials",
        headers=auth_headers,
        json={"name": "Кабель", "unit": "м", "unit_cost": "10.25"},
    ).json()
    adjustment = {
        "material_id": material["id"],
        "quantity": "2.5",
        "operation_id": "receipt-1",
    }
    assert (
        client.post(
            "/api/materials/adjust", headers=auth_headers, json=adjustment
        ).status_code
        == 200
    )
    usage = {
        "material_id": material["id"],
        "quantity": "1.5",
        "operation_id": "usage-1",
    }
    first = client.post(
        f"/api/tasks/{row.id}/materials", headers=auth_headers, json=usage
    )
    assert first.status_code == 200, first.text
    repeated = client.post(
        f"/api/tasks/{row.id}/materials", headers=auth_headers, json=usage
    )
    assert first.json()["id"] == repeated.json()["id"]
    assert (
        client.post(
            f"/api/tasks/{row.id}/materials",
            headers=auth_headers,
            json={**usage, "operation_id": "usage-2"},
        ).status_code
        == 409
    )
    stocks = client.get("/api/materials/stocks", headers=auth_headers).json()
    assert float(stocks[0]["quantity"]) == 1.0
    assert (
        client.post(
            f"/api/tasks/{row.id}/materials",
            headers=auth_headers,
            json={**usage, "quantity": "0.5"},
        ).status_code
        == 422
    )


def test_equipment_link_and_qr(client, auth_headers, db_session):
    address = AddressModel(address="Ленина, 1")
    db_session.add(address)
    db_session.flush()
    equipment = AddressEquipmentModel(
        address_id=address.id, name="Панель", serial_number="ABC-123"
    )
    db_session.add(equipment)
    db_session.commit()
    row = task(db_session, address_id=address.id)
    assert (
        client.put(
            f"/api/tasks/{row.id}/equipment",
            headers=auth_headers,
            json={"equipment_id": equipment.id},
        ).status_code
        == 200
    )
    passport = client.get(f"/api/equipment/{equipment.id}", headers=auth_headers).json()
    assert passport["tasks"][0]["id"] == row.id
    qr = client.get(f"/api/equipment/{equipment.id}/qr", headers=auth_headers)
    assert qr.status_code == 200, qr.text
    assert "<svg" in qr.text


def test_user_with_material_balance_cannot_be_deleted(
    client, auth_headers, db_session, worker_user
):
    from app.models.operations import MaterialModel, MaterialStockModel

    material = MaterialModel(name="Запас", unit="шт.")
    db_session.add(material)
    db_session.flush()
    db_session.add(
        MaterialStockModel(material_id=material.id, user_id=worker_user.id, quantity=1)
    )
    db_session.commit()
    response = client.delete(f"/api/admin/users/{worker_user.id}", headers=auth_headers)
    assert response.status_code == 409, response.text
    from sqlalchemy import text

    db_session.query(MaterialStockModel).filter_by(user_id=worker_user.id).update(
        {"quantity": 0}
    )
    db_session.commit()
    if db_session.bind.dialect.name == "sqlite":
        db_session.execute(text("PRAGMA foreign_keys=ON"))
        db_session.commit()
    deleted = client.delete(f"/api/admin/users/{worker_user.id}", headers=auth_headers)
    assert deleted.status_code == 200, deleted.text
    assert db_session.query(MaterialStockModel).count() == 0


def test_material_cannot_cross_task_organization(client, auth_headers, db_session):
    from app.models import OrganizationModel

    org = OrganizationModel(name="Другой контур", slug="other-material-org")
    db_session.add(org)
    db_session.commit()
    row = task(db_session, organization_id=org.id)
    material = client.post(
        "/api/materials", headers=auth_headers, json={"name": "Общий материал"}
    ).json()
    response = client.post(
        f"/api/tasks/{row.id}/materials",
        headers=auth_headers,
        json={
            "material_id": material["id"],
            "quantity": "1",
            "operation_id": "cross-tenant",
        },
    )
    assert response.status_code == 403, response.text
