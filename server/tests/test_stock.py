"""Склад: передачи склад ↔ исполнитель, инвентаризация, списание по актам, обороты."""

from datetime import datetime
from decimal import Decimal

from fastapi.testclient import TestClient

from app.models.operations import MaterialModel, MaterialMovementModel
from tests.test_acts import _act, _catalog_item, _org


def _material(client, headers, **fields):
    payload = {"name": "Трубка УКП-12", "unit": "шт", "unit_cost": "350", **fields}
    response = client.post("/api/materials", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _op(client, headers, kind, material_id, quantity, op, user_id=None):
    return client.post(
        "/api/materials/operations",
        json={
            "kind": kind,
            "material_id": material_id,
            "user_id": user_id,
            "quantity": str(quantity),
            "operation_id": op,
        },
        headers=headers,
    )


def _stock(client, headers, user_id=None):
    params = {"user_id": user_id} if user_id else {}
    rows = client.get("/api/materials/stocks", params=params, headers=headers).json()
    return {row["material_id"]: Decimal(row["quantity"]) for row in rows}


def _warehouse(db_session, material_id):
    material = db_session.get(MaterialModel, material_id)
    db_session.refresh(material)
    return Decimal(material.warehouse_quantity)


class TestWarehouse:
    def test_receipt_issue_return(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "StockOrg")
        headers = ctx.dispatcher.headers
        worker_id = ctx.worker.user.id
        material = _material(client, headers, min_quantity="5")

        assert (
            _op(client, headers, "receipt", material["id"], 10, "r1").status_code == 200
        )
        issued = _op(client, headers, "issue", material["id"], 4, "i1", worker_id)
        assert issued.status_code == 200, issued.text
        assert issued.json()["kind"] == "issue"
        # Повтор с тем же ключом не проводит второй раз
        assert (
            _op(client, headers, "issue", material["id"], 4, "i1", worker_id).json()[
                "id"
            ]
            == issued.json()["id"]
        )
        assert _warehouse(db_session, material["id"]) == Decimal("6")
        assert _stock(client, headers, worker_id)[material["id"]] == Decimal("4")

        returned = _op(client, headers, "return", material["id"], 1, "ret1", worker_id)
        assert returned.status_code == 200, returned.text
        assert _warehouse(db_session, material["id"]) == Decimal("7")

        too_much = _op(client, headers, "issue", material["id"], 100, "i2", worker_id)
        assert too_much.status_code == 409
        assert _warehouse(db_session, material["id"]) == Decimal("7")

        balances = client.get("/api/materials/balances", headers=headers).json()
        row = next(b for b in balances if b["material_id"] == material["id"])
        assert Decimal(row["warehouse_quantity"]) == Decimal("7")
        assert row["low"] is False
        assert Decimal(row["total_quantity"]) == Decimal("10")
        assert [Decimal(h["quantity"]) for h in row["holders"]] == [Decimal("3")]

    def test_inventory_and_low_stock(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "InvOrg")
        headers = ctx.dispatcher.headers
        material = _material(client, headers, min_quantity="5")
        _op(client, headers, "receipt", material["id"], 8, "r1")

        counted = _op(client, headers, "adjust", material["id"], 3, "inv1")
        assert counted.status_code == 200, counted.text
        assert Decimal(counted.json()["quantity"]) == Decimal("-5")
        same = _op(client, headers, "adjust", material["id"], 3, "inv2")
        assert same.status_code == 422

        balances = client.get("/api/materials/balances", headers=headers).json()
        assert balances[0]["low"] is True

    def test_worker_cannot_operate_or_see_others(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "WrkOrg")
        material = _material(client, ctx.dispatcher.headers)
        denied = _op(client, ctx.worker.headers, "receipt", material["id"], 1, "w1")
        assert denied.status_code == 403
        foreign = client.get(
            "/api/materials/stocks",
            params={"user_id": ctx.dispatcher.user.id},
            headers=ctx.worker.headers,
        )
        assert foreign.status_code == 403

    def test_archive_hides_material(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "ArcOrg")
        headers = ctx.dispatcher.headers
        material = _material(client, headers)
        archived = client.patch(
            f"/api/materials/{material['id']}", json={"active": False}, headers=headers
        )
        assert archived.status_code == 200
        assert client.get("/api/materials", headers=headers).json() == []
        everything = client.get(
            "/api/materials", params={"include_archived": True}, headers=headers
        ).json()
        assert [m["id"] for m in everything] == [material["id"]]
        assert (
            _op(client, headers, "receipt", material["id"], 1, "r").status_code == 422
        )


class TestActWriteOff:
    def _setup(self, client, db_session, name):
        ctx = _org(client, db_session, name)
        headers = ctx.dispatcher.headers
        material = _material(client, headers)
        _op(client, headers, "receipt", material["id"], 5, "r1")
        _op(client, headers, "issue", material["id"], 2, "i1", ctx.worker.user.id)
        item = _catalog_item(
            client,
            headers,
            name="Трубка",
            line_type="material",
            price=900,
            material_id=material["id"],
        )
        return ctx, material, item

    def test_act_writes_off_from_assignee_and_cancel_returns(
        self, client: TestClient, db_session
    ):
        ctx, material, item = self._setup(client, db_session, "ActStock")
        worker_id = ctx.worker.user.id
        act = _act(
            client,
            ctx.dispatcher.headers,
            ctx.task.id,
            lines=[{"catalog_item_id": item["id"], "qty": 3}],
        )
        assert act.status_code == 201, act.text
        # Нехватка не блокирует акт — остаток уходит в минус
        assert _stock(client, ctx.dispatcher.headers, worker_id)[
            material["id"]
        ] == Decimal("-1")

        cancelled = client.post(
            f"/api/acts/{act.json()['id']}/cancel",
            json={"reason": "ошибка"},
            headers=ctx.dispatcher.headers,
        )
        assert cancelled.status_code == 200, cancelled.text
        assert _stock(client, ctx.dispatcher.headers, worker_id)[
            material["id"]
        ] == Decimal("2")
        kinds = [
            row.kind
            for row in db_session.query(MaterialMovementModel)
            .filter_by(task_id=ctx.task.id)
            .order_by(MaterialMovementModel.id)
        ]
        assert kinds == ["act", "act_cancel"]

    def test_manual_write_off_is_not_doubled(self, client: TestClient, db_session):
        ctx, material, item = self._setup(client, db_session, "ManStock")
        worker_id = ctx.worker.user.id
        manual = client.post(
            f"/api/tasks/{ctx.task.id}/materials",
            json={
                "material_id": material["id"],
                "user_id": worker_id,
                "quantity": "1",
                "operation_id": "m1",
            },
            headers=ctx.dispatcher.headers,
        )
        assert manual.status_code == 200, manual.text
        act = _act(
            client,
            ctx.worker.headers,
            ctx.task.id,
            lines=[{"catalog_item_id": item["id"], "qty": 2}],
        )
        assert act.status_code == 201, act.text
        # Вручную списан 1, актом досписан ещё 1: из 2 выданных осталось 0
        assert _stock(client, ctx.dispatcher.headers, worker_id)[
            material["id"]
        ] == Decimal("0")

    def test_correction_act_rebalances(self, client: TestClient, db_session):
        ctx, material, item = self._setup(client, db_session, "FixStock")
        worker_id = ctx.worker.user.id
        first = _act(
            client,
            ctx.dispatcher.headers,
            ctx.task.id,
            lines=[{"catalog_item_id": item["id"], "qty": 2}],
        ).json()
        second = _act(
            client,
            ctx.dispatcher.headers,
            ctx.task.id,
            lines=[{"catalog_item_id": item["id"], "qty": 1}],
            supersedes_act_id=first["id"],
        )
        assert second.status_code == 201, second.text
        assert _stock(client, ctx.dispatcher.headers, worker_id)[
            material["id"]
        ] == Decimal("1")

    def test_catalog_rejects_foreign_material(self, client: TestClient, db_session):
        own = _org(client, db_session, "CatMatOwn")
        other = _org(client, db_session, "CatMatOther")
        foreign = _material(client, other.dispatcher.headers)
        response = client.post(
            "/api/service-catalog",
            json={
                "name": "Чужое",
                "line_type": "material",
                "material_id": foreign["id"],
            },
            headers=own.dispatcher.headers,
        )
        assert response.status_code == 422


class TestTurnover:
    def test_month_turnover_and_excel(self, client: TestClient, db_session):
        ctx, material, item = TestActWriteOff()._setup(client, db_session, "TurnOrg")
        headers = ctx.dispatcher.headers
        _act(
            client,
            headers,
            ctx.task.id,
            lines=[{"catalog_item_id": item["id"], "qty": 1}],
        )
        month = datetime.now().strftime("%Y-%m")
        rows = client.get(
            "/api/materials/turnover", params={"month": month}, headers=headers
        )
        assert rows.status_code == 200, rows.text
        by_holder = {row["holder"]: row for row in rows.json()}
        warehouse = by_holder["Склад"]
        assert Decimal(warehouse["received"]) == Decimal("5")
        assert Decimal(warehouse["transferred"]) == Decimal("2")
        assert Decimal(warehouse["closing"]) == Decimal("3")
        worker = next(row for row in rows.json() if row["user_id"] is not None)
        assert Decimal(worker["received"]) == Decimal("2")
        assert Decimal(worker["used"]) == Decimal("1")
        assert Decimal(worker["closing"]) == Decimal("1")

        journal = client.get(
            "/api/materials/movements", params={"month": month}, headers=headers
        ).json()
        assert journal["total"] == 4
        assert {item["kind"] for item in journal["items"]} == {
            "receipt",
            "issue",
            "act",
        }

        xlsx = client.get(
            "/api/materials/turnover.xlsx", params={"month": month}, headers=headers
        )
        assert xlsx.status_code == 200
        assert xlsx.content[:2] == b"PK"
