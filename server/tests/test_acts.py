"""Акты выполненных работ: прайс, выпуск, PDF, скан подписанного, аннулирование."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.models import (
    ActModel,
    CommentModel,
    OrganizationModel,
    TaskModel,
    TaskStatus,
    UserRole,
    init_default_settings,
)
from app.services.act_service import document_hash
from app.services.business_time import business_tz
from tests.test_multitenant_isolation_api import _create_org_user, _login_headers

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def acts_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.act_service.acts_dir", lambda: tmp_path)
    return tmp_path


def _org(client: TestClient, db_session, name: str):
    init_default_settings(db_session)
    org = OrganizationModel(name=name, slug=name.lower(), is_active=True)
    db_session.add(org)
    db_session.commit()
    users = {}
    for role in (UserRole.DISPATCHER, UserRole.WORKER):
        user = _create_org_user(
            db_session,
            username=f"{name.lower()}-{role.value}",
            password="pass123",
            role=role.value,
            organization_id=org.id,
        )
        users[role.value] = SimpleNamespace(
            user=user, headers=_login_headers(client, user.username, "pass123")
        )
    task = TaskModel(
        title="Невская 9",
        raw_address="ул. Невская, д. 9",
        description="",
        status=TaskStatus.IN_PROGRESS.value,
        organization_id=org.id,
        assigned_user_id=users["worker"].user.id,
        task_number="Z-00042",
        defect_type="Не работает трубка",
    )
    db_session.add(task)
    db_session.commit()
    return SimpleNamespace(
        org=org,
        task=task,
        dispatcher=users["dispatcher"],
        worker=users["worker"],
    )


def _catalog_item(client, headers, **fields):
    payload = {"name": "Замена трубки", "unit": "шт", "price": 1500, **fields}
    response = client.post("/api/service-catalog", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _act(client, headers, task_id, **fields):
    payload = {
        "lines": [{"name": "Диагностика", "price": 500}],
        "customer_name": "Петров П. П.",
        "apartment": "45",
        **fields,
    }
    return client.post(f"/api/tasks/{task_id}/acts", json=payload, headers=headers)


class TestCatalog:
    def test_crud_and_isolation(self, client: TestClient, db_session):
        own = _org(client, db_session, "CatOrg")
        other = _org(client, db_session, "CatOther")
        item = _catalog_item(client, own.dispatcher.headers)

        updated = client.patch(
            f"/api/service-catalog/{item['id']}",
            json={"price": 1700},
            headers=own.dispatcher.headers,
        ).json()
        listed = client.get(
            "/api/service-catalog", headers=own.dispatcher.headers
        ).json()
        foreign = client.get(
            "/api/service-catalog", headers=other.dispatcher.headers
        ).json()

        assert updated["price"] == 1700
        assert [i["id"] for i in listed] == [item["id"]]
        assert foreign == []
        assert (
            client.delete(
                f"/api/service-catalog/{item['id']}", headers=other.dispatcher.headers
            ).status_code
            == 404
        )

    def test_worker_reads_but_cannot_edit(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "CatWrk")
        _catalog_item(client, ctx.dispatcher.headers)

        assert (
            client.get("/api/service-catalog", headers=ctx.worker.headers).status_code
            == 200
        )
        assert (
            client.post(
                "/api/service-catalog",
                json={"name": "X", "price": 1},
                headers=ctx.worker.headers,
            ).status_code
            == 403
        )


class TestCreateAct:
    def test_server_counts_amounts_and_numbers(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "ActOrg")
        item = _catalog_item(client, ctx.dispatcher.headers)

        response = _act(
            client,
            ctx.dispatcher.headers,
            ctx.task.id,
            lines=[
                {"catalog_item_id": item["id"], "qty": 2},
                {
                    "name": "Кабель",
                    "line_type": "material",
                    "unit": "м",
                    "qty": 1.5,
                    "price": 99.99,
                },
            ],
            payment_method="cash",
        )

        assert response.status_code == 201, response.text
        act = response.json()
        year = __import__("datetime").datetime.now(business_tz()).year
        assert act["number"] == f"А-{year}-000001"
        assert act["status"] == "pending_signature"
        assert [(line["name"], line["amount"]) for line in act["lines"]] == [
            ("Замена трубки", 3000.0),
            ("Кабель", 149.99),
        ]
        assert act["total_amount"] == 3149.99
        assert act["task_number"] == "Z-00042"

        second = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        assert second["number"] == f"А-{year}-000002"

    def test_hash_matches_snapshot_and_task_history(
        self, client: TestClient, db_session
    ):
        ctx = _org(client, db_session, "HashOrg")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()

        model = db_session.get(ActModel, act["id"])
        comments = [
            c.text
            for c in db_session.query(CommentModel).filter(
                CommentModel.task_id == ctx.task.id
            )
        ]

        assert act["document_hash"] == document_hash(
            model.content_snapshot, model.requisites_snapshot
        )
        assert f"Оформлен акт №{act['number']} на сумму 500.00 ₽" in comments

    def test_rejects_empty_act_and_foreign_catalog(
        self, client: TestClient, db_session
    ):
        ctx = _org(client, db_session, "RejAct")
        other = _org(client, db_session, "RejActOther")
        foreign_item = _catalog_item(client, other.dispatcher.headers)

        empty = _act(client, ctx.dispatcher.headers, ctx.task.id, lines=[])
        foreign = _act(
            client,
            ctx.dispatcher.headers,
            ctx.task.id,
            lines=[{"catalog_item_id": foreign_item["id"]}],
        )

        assert empty.status_code == 422
        assert foreign.status_code == 400

    def test_supersede_cancels_previous(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "SupOrg")
        first = _act(client, ctx.dispatcher.headers, ctx.task.id).json()

        second = _act(
            client, ctx.dispatcher.headers, ctx.task.id, supersedes_act_id=first["id"]
        ).json()
        acts = client.get(
            f"/api/tasks/{ctx.task.id}/acts", headers=ctx.dispatcher.headers
        ).json()

        by_id = {a["id"]: a for a in acts}
        assert by_id[first["id"]]["status"] == "cancelled"
        assert (
            by_id[first["id"]]["cancel_reason"] == f"Заменён актом №{second['number']}"
        )
        assert by_id[second["id"]]["supersedes_act_id"] == first["id"]


class TestActDocuments:
    def test_pdf(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "PdfOrg")
        act = _act(
            client, ctx.dispatcher.headers, ctx.task.id, payment_method="cash"
        ).json()

        response = client.get(
            f"/api/acts/{act['id']}/pdf", headers=ctx.dispatcher.headers
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")
        assert "filename*=UTF-8''" in response.headers["content-disposition"]

    def test_signed_scan(self, client: TestClient, db_session, acts_dir):
        ctx = _org(client, db_session, "ScanOrg")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        url = f"/api/acts/{act['id']}/scan"

        wrong = client.post(
            url,
            files={"file": ("a.txt", b"hello", "text/plain")},
            headers=ctx.worker.headers,
        )
        signed = client.post(
            url,
            files={"file": ("scan.png", PNG, "image/png")},
            headers=ctx.worker.headers,
        )
        again = client.post(
            url,
            files={"file": ("scan.png", PNG, "image/png")},
            headers=ctx.worker.headers,
        )
        downloaded = client.get(url, headers=ctx.dispatcher.headers)

        assert wrong.status_code == 415
        assert signed.status_code == 200
        assert (signed.json()["status"], signed.json()["signed_via"]) == (
            "signed",
            "paper",
        )
        assert signed.json()["has_scan"] is True
        assert again.status_code == 400
        assert downloaded.content == PNG

    def test_cancel_requires_manage_and_once(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "CanOrg")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        url = f"/api/acts/{act['id']}/cancel"

        by_worker = client.post(
            url, json={"reason": "ошибка"}, headers=ctx.worker.headers
        )
        cancelled = client.post(
            url, json={"reason": "ошибка в сумме"}, headers=ctx.dispatcher.headers
        )
        twice = client.post(
            url, json={"reason": "ещё раз"}, headers=ctx.dispatcher.headers
        )

        assert by_worker.status_code == 403
        assert cancelled.json()["status"] == "cancelled"
        assert twice.status_code == 400


class TestVisibility:
    def test_worker_sees_only_own_tasks(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "VisOrg")
        own = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        stranger_task = TaskModel(
            title="Чужая",
            raw_address="ул. Садовая, д. 1",
            description="",
            status=TaskStatus.NEW.value,
            organization_id=ctx.org.id,
        )
        db_session.add(stranger_task)
        db_session.commit()
        foreign = _act(client, ctx.dispatcher.headers, stranger_task.id).json()

        registry = client.get("/api/acts", headers=ctx.worker.headers).json()

        assert [a["id"] for a in registry["items"]] == [own["id"]]
        assert (
            client.get(
                f"/api/acts/{foreign['id']}", headers=ctx.worker.headers
            ).status_code
            == 404
        )

    def test_other_org_cannot_see(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "IsoOrg")
        other = _org(client, db_session, "IsoOther")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()

        assert (
            client.get(
                f"/api/acts/{act['id']}/pdf", headers=other.dispatcher.headers
            ).status_code
            == 404
        )
        assert (
            client.get("/api/acts", headers=other.dispatcher.headers).json()["total"]
            == 0
        )

    def test_registry_filters(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "RegOrg")
        first = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        _act(
            client, ctx.dispatcher.headers, ctx.task.id, customer_name="Сидоров"
        ).json()
        client.post(
            f"/api/acts/{first['id']}/cancel",
            json={"reason": "дубль"},
            headers=ctx.dispatcher.headers,
        )

        def numbers(**params):
            return [
                a["number"]
                for a in client.get(
                    "/api/acts", params=params, headers=ctx.dispatcher.headers
                ).json()["items"]
            ]

        assert numbers(status="cancelled") == [first["number"]]
        assert len(numbers(search="Сидор")) == 1

    def test_registry_days_follow_business_calendar(
        self, client: TestClient, db_session
    ):
        """Акт, выпущенный 1 ноября в 01:00 по Москве (31 октября 22:00 UTC),
        — ноябрьский: в фильтре по дням и в сводке за месяц."""
        from datetime import datetime

        ctx = _org(client, db_session, "DayOrg")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        row = db_session.get(ActModel, act["id"])
        row.created_at = datetime(2026, 10, 31, 22, 0)
        db_session.commit()

        def total(**params):
            return client.get(
                "/api/acts", params=params, headers=ctx.dispatcher.headers
            ).json()["total"]

        assert total(date_from="2026-11-01", date_to="2026-11-30") == 1
        assert total(date_from="2026-10-01", date_to="2026-10-31") == 0
