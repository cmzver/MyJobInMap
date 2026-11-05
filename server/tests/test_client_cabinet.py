"""Кабинет клиента: вход, изоляция контрагентов, заявки, акты, подпись, ТО."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.models import CommentModel, NotificationModel, TaskModel, TaskStatus
from app.models.operations import MaintenancePlanModel
from tests.test_acts import _act
from tests.test_acts_mobile import _png
from tests.test_counterparties import MONTH, _address, _counterparty, _org, _system

PASSWORD = "Kabinet-2026"


@pytest.fixture(autouse=True)
def acts_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.act_service.acts_dir", lambda: tmp_path)
    return tmp_path


@pytest.fixture(autouse=True)
def no_broadcast(monkeypatch):
    async def done(**_kwargs):
        return None

    monkeypatch.setattr("app.api.client.broadcast_act_updated", done)


def _account(client, headers, counterparty_id, login="uk-smirnova", **fields):
    payload = {
        "login": login,
        "password": PASSWORD,
        "full_name": "Смирнова О. П.",
        "position": "Главный инженер",
        **fields,
    }
    response = client.post(
        f"/api/counterparties/{counterparty_id}/accounts", json=payload, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def _login(client, login, password=PASSWORD):
    return client.post(
        "/api/client/auth/login", json={"login": login, "password": password}
    )


def _headers(client, login, password=PASSWORD):
    response = _login(client, login, password)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _setup(client, db_session, name):
    """Два контрагента: у «нашего» объект с заявкой, у чужого — свой объект."""
    env = _org(client, db_session, name)
    headers = env.dispatcher.headers
    ours = _counterparty(client, headers, name="УК Наша")
    theirs = _counterparty(client, headers, name="ТСЖ Чужое")
    own_address = _address(db_session, env, "ул. Невская, д. 9")
    foreign_address = _address(db_session, env, "пр. Энгельса, д. 120")
    _system(db_session, own_address, "Домофония", 6200)
    for counterparty, address in ((ours, own_address), (theirs, foreign_address)):
        assert (
            client.put(
                f"/api/counterparties/{counterparty['id']}/addresses",
                json={"address_ids": [address.id]},
                headers=headers,
            ).status_code
            == 200
        )
    env.task.address_id = own_address.id
    foreign_task = TaskModel(
        title="Чужая заявка",
        raw_address=foreign_address.address,
        status=TaskStatus.NEW.value,
        organization_id=env.org.id,
        address_id=foreign_address.id,
        task_number="Z-00077",
    )
    db_session.add(foreign_task)
    db_session.add(
        CommentModel(task_id=env.task.id, text="Внутреннее: жилец скандальный")
    )
    db_session.add(
        CommentModel(
            task_id=env.task.id,
            text="Статус изменён",
            old_status="NEW",
            new_status="IN_PROGRESS",
        )
    )
    db_session.commit()
    _account(client, headers, ours["id"])
    _account(client, headers, theirs["id"], login="tsj-other")
    env.ours, env.theirs = ours, theirs
    env.own_address, env.foreign_address = own_address, foreign_address
    env.foreign_task = foreign_task
    return env


class TestAuth:
    def test_login_me_and_token_separation(self, client: TestClient, db_session):
        env = _setup(client, db_session, "CabAuth")
        assert _login(client, "uk-smirnova", "wrong").status_code == 401
        assert _login(client, "nobody", PASSWORD).status_code == 401
        headers = _headers(client, "UK-Smirnova")  # логин без учёта регистра
        me = client.get("/api/client/me", headers=headers)
        assert me.status_code == 200, me.text
        assert me.json()["counterparty_name"] == "УК Наша"

        # Токен кабинета не открывает API сотрудников, и наоборот
        assert client.get("/api/tasks", headers=headers).status_code == 401
        assert (
            client.get("/api/client/me", headers=env.dispatcher.headers).status_code
            == 401
        )

    def test_reset_and_disable_revoke_tokens(self, client: TestClient, db_session):
        env = _setup(client, db_session, "CabRevoke")
        headers = _headers(client, "uk-smirnova")
        accounts = client.get(
            f"/api/counterparties/{env.ours['id']}/accounts",
            headers=env.dispatcher.headers,
        ).json()
        url = f"/api/counterparties/{env.ours['id']}/accounts/{accounts[0]['id']}"
        reset = client.patch(
            url, json={"password": "Novyi-parol-1"}, headers=env.dispatcher.headers
        )
        assert reset.status_code == 200, reset.text
        assert client.get("/api/client/me", headers=headers).status_code == 401
        headers = _headers(client, "uk-smirnova", "Novyi-parol-1")

        client.patch(url, json={"is_active": False}, headers=env.dispatcher.headers)
        assert client.get("/api/client/me", headers=headers).status_code == 401
        assert _login(client, "uk-smirnova", "Novyi-parol-1").status_code == 401

    def test_inactive_counterparty_blocks_login(self, client: TestClient, db_session):
        env = _setup(client, db_session, "CabOff")
        client.patch(
            f"/api/counterparties/{env.ours['id']}",
            json={"is_active": False},
            headers=env.dispatcher.headers,
        )
        assert _login(client, "uk-smirnova").status_code == 401

    def test_worker_cannot_manage_accounts_and_logins_unique(
        self, client: TestClient, db_session
    ):
        env = _setup(client, db_session, "CabPerm")
        url = f"/api/counterparties/{env.ours['id']}/accounts"
        assert client.get(url, headers=env.worker.headers).status_code == 403
        duplicate = client.post(
            url,
            json={"login": "uk-smirnova", "password": PASSWORD, "full_name": "Дубль"},
            headers=env.dispatcher.headers,
        )
        assert duplicate.status_code == 409


class TestIsolation:
    def test_sees_only_own_objects_and_tasks(self, client: TestClient, db_session):
        env = _setup(client, db_session, "CabIso")
        headers = _headers(client, "uk-smirnova")

        objects = client.get("/api/client/objects", headers=headers).json()
        assert [o["address"] for o in objects] == ["ул. Невская, д. 9"]
        assert objects[0]["systems"][0]["name"] == "Домофония"

        tasks = client.get(
            "/api/client/tasks", params={"status": "all"}, headers=headers
        ).json()
        assert [t["id"] for t in tasks["items"]] == [env.task.id]
        assert (
            client.get(
                f"/api/client/tasks/{env.foreign_task.id}", headers=headers
            ).status_code
            == 404
        )

        detail = client.get(f"/api/client/tasks/{env.task.id}", headers=headers).json()
        texts = [event["text"] for event in detail["events"]]
        assert texts == ["Заявка принята", "Статус: В работе"]
        assert "скандальный" not in str(detail)

    def test_acts_scoped_and_pdf(self, client: TestClient, db_session):
        env = _setup(client, db_session, "CabActs")
        own = _act(
            client, env.dispatcher.headers, env.task.id, customer_role="uk_rep"
        ).json()
        # Акт жильца по той же заявке: его ФИО, телефон и сумма — не для УК
        resident = _act(client, env.dispatcher.headers, env.task.id).json()
        foreign_task_act = _act(
            client, env.dispatcher.headers, env.foreign_task.id, customer_role="uk_rep"
        ).json()
        headers = _headers(client, "uk-smirnova")
        acts = client.get("/api/client/acts", headers=headers).json()
        assert [a["id"] for a in acts["items"]] == [own["id"]]
        detail = client.get(f"/api/client/tasks/{env.task.id}", headers=headers).json()
        assert [a["id"] for a in detail["acts"]] == [own["id"]]
        assert detail["acts_count"] == 1
        for act_id in (resident["id"], foreign_task_act["id"]):
            assert (
                client.get(
                    f"/api/client/acts/{act_id}/pdf", headers=headers
                ).status_code
                == 404
            )
            assert (
                client.post(
                    f"/api/client/acts/{act_id}/sign",
                    data={"consent": "true"},
                    files={"signature": ("s.png", _png(), "image/png")},
                    headers=headers,
                ).status_code
                == 404
            )
        pdf = client.get(f"/api/client/acts/{own['id']}/pdf", headers=headers)
        assert pdf.status_code == 200
        assert pdf.content[:4] == b"%PDF"
        assert (
            client.get(
                f"/api/client/acts/{foreign_task_act['id']}/pdf", headers=headers
            ).status_code
            == 404
        )


class TestCabinetTasks:
    def test_create_task_notifies_dispatchers(self, client: TestClient, db_session):
        env = _setup(client, db_session, "CabNew")
        headers = _headers(client, "uk-smirnova")
        created = client.post(
            "/api/client/tasks",
            json={
                "address_id": env.own_address.id,
                "title": "Не открывается дверь подъезда",
                "description": "Второй подъезд",
                "apartment": "12",
                "urgent": True,
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["from_cabinet"] is True
        assert body["address"] == "ул. Невская, д. 9, кв. 12"
        task = db_session.get(TaskModel, body["id"])
        assert task.organization_id == env.org.id
        assert task.priority == "URGENT"
        assert task.customer_name == "Смирнова О. П."
        notified = (
            db_session.query(NotificationModel)
            .filter_by(task_id=task.id, user_id=env.dispatcher.user.id)
            .count()
        )
        assert notified == 1

        foreign = client.post(
            "/api/client/tasks",
            json={"address_id": env.foreign_address.id, "title": "Чужой объект"},
            headers=headers,
        )
        assert foreign.status_code == 404

    def test_no_sms_and_rate_limit(self, client: TestClient, db_session, monkeypatch):
        from app.api import client as client_api
        from app.models import OrganizationSettingsModel
        from app.models.outbox import OutboxEventModel

        env = _setup(client, db_session, "CabLimit")
        db_session.add(
            OrganizationSettingsModel(
                organization_id=env.org.id, sms_enabled=True, sms_api_id="KEY"
            )
        )
        db_session.commit()
        monkeypatch.setattr(client_api, "MAX_TASKS_PER_HOUR", 2)
        headers = _headers(client, "uk-smirnova")
        body = {
            "address_id": env.own_address.id,
            "title": "Купите подписку на сайте",
            "contact_phone": "+79110000000",
        }
        codes = [
            client.post("/api/client/tasks", json=body, headers=headers).status_code
            for _ in range(3)
        ]
        assert codes == [201, 201, 429]
        assert (
            db_session.query(OutboxEventModel).filter_by(kind="sms_send").count() == 0
        )

    def test_description_only_for_own_tasks(self, client: TestClient, db_session):
        env = _setup(client, db_session, "CabDesc")
        env.task.description = "Звонила жилица, тел. +79119998877"
        db_session.commit()
        detail = client.get(
            f"/api/client/tasks/{env.task.id}", headers=_headers(client, "uk-smirnova")
        ).json()
        assert detail["description"] == ""

    def test_maintenance_list(self, client: TestClient, db_session):
        env = _setup(client, db_session, "CabTo")
        for address in (env.own_address, env.foreign_address):
            db_session.add(
                MaintenancePlanModel(
                    organization_id=env.org.id,
                    address_id=address.id,
                    title=f"ТО {address.address}",
                    frequency="monthly",
                    interval=1,
                    start_date=date.today(),
                    next_date=date.today(),
                )
            )
        db_session.commit()
        plans = client.get(
            "/api/client/maintenance", headers=_headers(client, "uk-smirnova")
        ).json()
        assert [p["title"] for p in plans] == ["ТО ул. Невская, д. 9"]


class TestSignInCabinet:
    def test_sign_summary_act(self, client: TestClient, db_session):
        env = _setup(client, db_session, "CabSign")
        issued = client.post(
            f"/api/counterparties/{env.ours['id']}/summary-acts",
            json={"month": MONTH},
            headers=env.dispatcher.headers,
        )
        assert issued.status_code == 201, issued.text
        headers = _headers(client, "uk-smirnova")
        pending = client.get(
            "/api/client/acts", params={"pending": True}, headers=headers
        ).json()
        assert [a["kind"] for a in pending["items"]] == ["summary"]

        url = f"/api/client/acts/{issued.json()['id']}/sign"
        files = {"signature": ("sign.png", _png(), "image/png")}
        refused = client.post(
            url, data={"consent": "false"}, files=files, headers=headers
        )
        assert refused.status_code == 400
        signed = client.post(
            url, data={"consent": "true"}, files=files, headers=headers
        )
        assert signed.status_code == 200, signed.text
        assert signed.json()["status"] == "signed"
        assert signed.json()["customer_name"] == "Смирнова О. П., Главный инженер"
        again = client.post(url, data={"consent": "true"}, files=files, headers=headers)
        assert again.status_code == 409

        other = _headers(client, "tsj-other")
        assert (
            client.post(
                url, data={"consent": "true"}, files=files, headers=other
            ).status_code
            == 404
        )
