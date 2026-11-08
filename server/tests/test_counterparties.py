"""Контрагенты (УК/ТСЖ) и сводный акт за месяц (раздел 7.9 плана)."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.models import (
    ActModel,
    AddressModel,
    AddressSystemModel,
    TaskStatus,
)
from app.services.business_time import business_tz
from tests.test_acts import _act, _org

MONTH = datetime.now(business_tz()).strftime("%Y-%m")


def _counterparty(client, headers, **fields):
    payload = {
        "name": "УК Жилкомсервис №2",
        "legal_name": "ООО «Жилкомсервис №2»",
        "inn": "7801234567",
        "contract_number": "ТО-17",
        "contract_date": "01.01.2026",
        "signer_name": "Смирнова О. П.",
        "signer_position": "Главный инженер",
        **fields,
    }
    response = client.post("/api/counterparties", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _address(db_session, env, name="ул. Невская, д. 9"):
    address = AddressModel(address=name, organization_id=env.org.id, lat=59.9, lon=30.3)
    db_session.add(address)
    db_session.commit()
    return address


def _system(db_session, address, name, cost, status="active", **dates):
    system = AddressSystemModel(
        address_id=address.id,
        system_type="intercom",
        name=name,
        status=status,
        monthly_cost=cost,
        contract_number="ДМ-77",
        **dates,
    )
    db_session.add(system)
    db_session.commit()
    return system


def _setup(client, db_session, name):
    """Организация, контрагент с объектом, системами, актами и выездом."""
    env = _org(client, db_session, name)
    headers = env.dispatcher.headers
    counterparty = _counterparty(client, headers)
    address = _address(db_session, env)
    other = _address(db_session, env, "пр. Энгельса, д. 120")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    _system(db_session, address, "Домофония", 6200)
    _system(db_session, address, "Видеонаблюдение", 4500)
    _system(db_session, address, "Отключённая", 999, status="disabled")
    _system(
        db_session,
        address,
        "Закончилась",
        777,
        service_end_date=now - timedelta(days=70),
    )
    _system(db_session, other, "Чужой объект", 1000)
    response = client.put(
        f"/api/counterparties/{counterparty['id']}/addresses",
        json={"address_ids": [address.id]},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    env.task.address_id = address.id
    env.task.status = TaskStatus.DONE.value
    env.task.completed_at = now
    db_session.commit()
    contract = _act(
        client,
        headers,
        env.task.id,
        lines=[{"name": "Ремонт доводчика", "price": 2500}],
        payment_method="contract",
    )
    assert contract.status_code == 201, contract.text
    cash = _act(client, headers, env.task.id, payment_method="cash")
    assert cash.status_code == 201, cash.text
    return env, headers, counterparty, address


class TestCounterparties:
    def test_crud_validation_and_isolation(self, client: TestClient, db_session):
        own = _org(client, db_session, "CpOwn")
        other = _org(client, db_session, "CpOther")
        created = _counterparty(client, own.dispatcher.headers)

        bad = client.post(
            "/api/counterparties",
            json={"name": "X", "inn": "123"},
            headers=own.dispatcher.headers,
        )
        assert bad.status_code == 422

        updated = client.patch(
            f"/api/counterparties/{created['id']}",
            json={"phone": "+7 812 555-12-34"},
            headers=own.dispatcher.headers,
        )
        assert updated.json()["phone"] == "+7 812 555-12-34"
        assert (
            client.get("/api/counterparties", headers=other.dispatcher.headers).json()
            == []
        )
        assert (
            client.get(
                f"/api/counterparties/{created['id']}", headers=other.dispatcher.headers
            ).status_code
            == 404
        )

    def test_addresses_assignment_syncs_management_company(
        self, client: TestClient, db_session
    ):
        env = _org(client, db_session, "CpAddr")
        foreign = _org(client, db_session, "CpAddrForeign")
        counterparty = _counterparty(client, env.dispatcher.headers)
        address = _address(db_session, env)
        _system(db_session, address, "Домофония", 6200)
        alien = _address(db_session, foreign, "ул. Чужая, д. 1")

        refused = client.put(
            f"/api/counterparties/{counterparty['id']}/addresses",
            json={"address_ids": [alien.id]},
            headers=env.dispatcher.headers,
        )
        assert refused.status_code == 400

        rows = client.put(
            f"/api/counterparties/{counterparty['id']}/addresses",
            json={"address_ids": [address.id]},
            headers=env.dispatcher.headers,
        ).json()
        assert rows == [
            {"id": address.id, "address": address.address, "monthly_cost": 6200}
        ]
        db_session.refresh(address)
        assert address.counterparty_id == counterparty["id"]
        assert address.management_company == "УК Жилкомсервис №2"
        listed = client.get(
            "/api/counterparties", headers=env.dispatcher.headers
        ).json()
        assert listed[0]["address_count"] == 1
        assert listed[0]["monthly_total"] == 6200

        client.put(
            f"/api/counterparties/{counterparty['id']}/addresses",
            json={"address_ids": []},
            headers=env.dispatcher.headers,
        )
        db_session.refresh(address)
        assert address.counterparty_id is None


class TestSummaryAct:
    def test_preview_bills_subscriptions_and_contract_acts(
        self, client: TestClient, db_session
    ):
        env, headers, counterparty, _ = _setup(client, db_session, "SumPrev")

        preview = client.get(
            f"/api/counterparties/{counterparty['id']}/summary-preview?month={MONTH}",
            headers=headers,
        )
        assert preview.status_code == 200, preview.text
        data = preview.json()
        names = [line["name"] for line in data["lines"]]
        assert names[:2] == [
            "Абонентское обслуживание: Домофония",
            "Абонентское обслуживание: Видеонаблюдение",
        ]
        assert len(names) == 3  # + работы по акту «по договору»; наличный — нет
        assert data["subscription_total"] == 10700
        assert data["acts_total"] == 2500
        assert data["total"] == 13200
        assert [visit["task_id"] for visit in data["visits"]] == [env.task.id]
        assert data["existing_act_id"] is None

    def test_issue_once_per_month_supersede_and_pdf(
        self, client: TestClient, db_session
    ):
        _, headers, counterparty, _ = _setup(client, db_session, "SumIssue")
        url = f"/api/counterparties/{counterparty['id']}/summary-acts"

        first = client.post(url, json={"month": MONTH}, headers=headers)
        assert first.status_code == 201, first.text
        act = first.json()
        assert act["kind"] == "summary"
        assert act["period"] == MONTH
        assert act["counterparty_name"] == "УК Жилкомсервис №2"
        assert act["total_amount"] == 13200
        assert act["payment_method"] == "contract"

        again = client.post(url, json={"month": MONTH}, headers=headers)
        assert again.status_code == 409

        fixed = client.post(
            url, json={"month": MONTH, "supersedes_act_id": act["id"]}, headers=headers
        )
        assert fixed.status_code == 201, fixed.text
        assert db_session.get(ActModel, act["id"]).status == "cancelled"

        pdf = client.get(f"/api/acts/{fixed.json()['id']}/pdf", headers=headers)
        assert pdf.status_code == 200
        assert pdf.content.startswith(b"%PDF")

        link = client.post(
            f"/api/acts/{fixed.json()['id']}/public-link", headers=headers
        )
        assert link.status_code == 400

        listed = client.get(url, headers=headers).json()
        assert [item["id"] for item in listed] == [fixed.json()["id"], act["id"]]

    def test_parallel_issue_does_not_create_second_act(
        self, client: TestClient, db_session, monkeypatch
    ):
        """Двойной клик: второй запрос прошёл первую проверку до коммита первого
        и ждал счётчик номеров. Под блокировкой он видит выпущенный акт — 409,
        второго акта за месяц нет."""
        from app.services import summary_act_service

        _, headers, counterparty, _ = _setup(client, db_session, "SumRace")
        url = f"/api/counterparties/{counterparty['id']}/summary-acts"
        assert (
            client.post(url, json={"month": MONTH}, headers=headers).status_code == 201
        )

        real = summary_act_service.existing_summary_act
        calls = {"n": 0}

        def racing(*args, **kwargs):
            calls["n"] += 1
            return None if calls["n"] == 1 else real(*args, **kwargs)

        monkeypatch.setattr(summary_act_service, "existing_summary_act", racing)
        again = client.post(url, json={"month": MONTH}, headers=headers)

        assert again.status_code == 409
        assert "другим запросом" in again.json()["detail"]
        assert (
            db_session.query(ActModel)
            .filter(
                ActModel.kind == "summary",
                ActModel.counterparty_id == counterparty["id"],
            )
            .count()
            == 1
        )

    def test_summary_act_not_counted_in_money(self, client: TestClient, db_session):
        _, headers, counterparty, _ = _setup(client, db_session, "SumMoney")
        before = client.get("/api/acts/summary", headers=headers).json()
        client.post(
            f"/api/counterparties/{counterparty['id']}/summary-acts",
            json={"month": MONTH},
            headers=headers,
        )
        after = client.get("/api/acts/summary", headers=headers).json()
        assert after["total"] == before["total"]
        assert after["issued"] == before["issued"]

    def test_nothing_to_bill_and_delete_guard(self, client: TestClient, db_session):
        env = _org(client, db_session, "SumEmpty")
        counterparty = _counterparty(client, env.dispatcher.headers)
        empty = client.post(
            f"/api/counterparties/{counterparty['id']}/summary-acts",
            json={"month": MONTH},
            headers=env.dispatcher.headers,
        )
        assert empty.status_code == 400

        _, headers, issued, _ = _setup(client, db_session, "SumDelete")
        client.post(
            f"/api/counterparties/{issued['id']}/summary-acts",
            json={"month": MONTH},
            headers=headers,
        )
        assert (
            client.delete(
                f"/api/counterparties/{issued['id']}", headers=headers
            ).status_code
            == 409
        )
        assert (
            client.delete(
                f"/api/counterparties/{counterparty['id']}",
                headers=env.dispatcher.headers,
            ).status_code
            == 204
        )

    def test_worker_cannot_issue(self, client: TestClient, db_session):
        env, _, counterparty, _ = _setup(client, db_session, "SumWorker")
        response = client.post(
            f"/api/counterparties/{counterparty['id']}/summary-acts",
            json={"month": MONTH},
            headers=env.worker.headers,
        )
        assert response.status_code == 403


class TestAddressCounterparty:
    def test_address_update_validates_counterparty(
        self, client: TestClient, db_session
    ):
        env = _org(client, db_session, "AddrCp")
        foreign = _org(client, db_session, "AddrCpForeign")
        address = _address(db_session, env)
        own = _counterparty(client, env.dispatcher.headers)
        alien = _counterparty(client, foreign.dispatcher.headers)

        bad = client.patch(
            f"/api/addresses/{address.id}",
            json={"counterparty_id": alien["id"]},
            headers=env.dispatcher.headers,
        )
        assert bad.status_code == 400
        ok = client.patch(
            f"/api/addresses/{address.id}",
            json={"counterparty_id": own["id"]},
            headers=env.dispatcher.headers,
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["counterparty_id"] == own["id"]
        assert ok.json()["management_company"] == own["name"]
