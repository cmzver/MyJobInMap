"""Уведомления заявителю: страница статуса, подписка Telegram, SMS через outbox."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.models import (
    CommentModel,
    OrganizationSettingsModel,
    TaskModel,
    TaskStatus,
    TaskSubscriberModel,
)
from app.models.outbox import OutboxEventModel
from app.services import applicant_notify
from tests.test_acts import _act, _org

BOT_TOKEN = "123456:TEST-bot-token"


@pytest.fixture(autouse=True)
def bot(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", BOT_TOKEN)
    monkeypatch.setattr(settings, "TELEGRAM_BOT_USERNAME", "fieldworker_bot")
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "https://fw.example.ru")


def _link(client, env):
    response = client.post(
        f"/api/tasks/{env.task.id}/status-link", headers=env.dispatcher.headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def _subscribe(client, code, chat_id="555", secret=None):
    return client.post(
        "/api/public/tasks/telegram/subscribe",
        json={"code": code, "chat_id": chat_id},
        headers={"X-Bot-Secret": secret or applicant_notify.bot_secret()},
    )


def _events(db_session, kind):
    return [
        row.payload
        for row in db_session.query(OutboxEventModel)
        .filter_by(kind=kind)
        .order_by(OutboxEventModel.id)
    ]


class TestStatusPage:
    def test_link_is_stable_and_page_hides_internals(
        self, client: TestClient, db_session
    ):
        env = _org(client, db_session, "StatOrg")
        env.task.customer_name = "Петров П. П."
        env.task.customer_phone = "+79110000000"
        db_session.add(CommentModel(task_id=env.task.id, text="Внутреннее: долг"))
        db_session.add(
            CommentModel(
                task_id=env.task.id,
                text="Статус",
                old_status="NEW",
                new_status="IN_PROGRESS",
            )
        )
        db_session.commit()
        first = _link(client, env)
        assert first == _link(client, env)
        assert first["url"] == f"https://fw.example.ru/portal/t/{first['token']}"
        assert first["telegram_url"].startswith("https://t.me/fieldworker_bot?start=")

        _act(client, env.dispatcher.headers, env.task.id)
        page = client.get(f"/api/public/tasks/{first['token']}")
        assert page.status_code == 200, page.text
        body = page.json()
        assert body["number"] == "Z-00042"
        assert [e["text"] for e in body["events"]] == ["Заявка принята", "В работе"]
        assert len(body["acts"]) == 1
        dump = str(body)
        for secret in ("Петров", "79110000000", "долг"):
            assert secret not in dump

        assert client.get("/api/public/tasks/" + "x" * 32).status_code == 404

    def test_link_expires_after_close_and_renew(self, client: TestClient, db_session):
        from datetime import datetime, timedelta

        env = _org(client, db_session, "StatTtl")
        env.task.raw_address = "ул. Невская, д. 9, кв. 45"
        db_session.commit()
        first = _link(client, env)
        page = client.get(f"/api/public/tasks/{first['token']}").json()
        assert page["address"] == "ул. Невская, д. 9"
        _subscribe(client, first["token"])

        renewed = client.post(
            f"/api/tasks/{env.task.id}/status-link",
            params={"renew": True},
            headers=env.dispatcher.headers,
        ).json()
        assert renewed["token"] != first["token"]
        assert renewed["subscribers"] == 0
        assert client.get(f"/api/public/tasks/{first['token']}").status_code == 404

        env.task.status = TaskStatus.DONE.value
        env.task.completed_at = datetime.utcnow() - timedelta(days=31)
        db_session.commit()
        assert client.get(f"/api/public/tasks/{renewed['token']}").status_code == 404

    def test_worker_of_other_org_cannot_issue(self, client: TestClient, db_session):
        env = _org(client, db_session, "StatOwn")
        other = _org(client, db_session, "StatOther")
        response = client.post(
            f"/api/tasks/{env.task.id}/status-link", headers=other.dispatcher.headers
        )
        assert response.status_code in (403, 404)


class TestTelegram:
    def test_subscribe_requires_bot_secret_and_is_idempotent(
        self, client: TestClient, db_session
    ):
        env = _org(client, db_session, "TgOrg")
        token = _link(client, env)["token"]
        assert _subscribe(client, token, secret="nope").status_code == 403
        ok = _subscribe(client, token)
        assert ok.status_code == 200, ok.text
        assert ok.json()["number"] == "Z-00042"
        assert _subscribe(client, token).status_code == 200
        assert db_session.query(TaskSubscriberModel).count() == 1

        stop = client.post(
            "/api/public/tasks/telegram/unsubscribe",
            json={"chat_id": "555"},
            headers={"X-Bot-Secret": applicant_notify.bot_secret()},
        )
        assert stop.status_code == 204
        assert db_session.query(TaskSubscriberModel).count() == 0

    def test_status_change_queues_message(self, client: TestClient, db_session):
        env = _org(client, db_session, "TgSend")
        token = _link(client, env)["token"]
        _subscribe(client, token)
        response = client.patch(
            f"/api/tasks/{env.task.id}/status",
            json={"status": "DONE", "comment": "Заменили трубку"},
            headers=env.dispatcher.headers,
        )
        assert response.status_code == 200, response.text
        messages = _events(db_session, "telegram_send")
        assert len(messages) == 1
        assert messages[0]["chat_id"] == "555"
        assert "Z-00042 выполнена" in messages[0]["text"]
        assert token in messages[0]["text"]

    def test_disabled_by_organization(self, client: TestClient, db_session):
        env = _org(client, db_session, "TgOff")
        db_session.add(
            OrganizationSettingsModel(
                organization_id=env.org.id, notify_telegram_enabled=False
            )
        )
        db_session.commit()
        link = _link(client, env)
        assert link["telegram_url"] is None
        assert _subscribe(client, link["token"]).status_code == 409


class TestSms:
    def test_sms_on_create_and_done_only(self, client: TestClient, db_session):
        env = _org(client, db_session, "SmsOrg")
        db_session.add(
            OrganizationSettingsModel(
                organization_id=env.org.id, sms_enabled=True, sms_api_id="KEY"
            )
        )
        db_session.commit()
        created = client.post(
            "/api/tasks",
            json={
                "title": "Не работает домофон",
                "address": "ул. Невская, д. 9",
                "customer_phone": "8 (911) 000-00-00",
            },
            headers=env.dispatcher.headers,
        )
        assert created.status_code == 200, created.text
        task = db_session.get(TaskModel, created.json()["id"])
        sms = _events(db_session, "sms_send")
        assert len(sms) == 1
        assert sms[0]["phone"] == "79110000000"
        assert task.public_token and task.public_token in sms[0]["text"]

        for status, comment in (("IN_PROGRESS", ""), ("DONE", "Готово")):
            client.patch(
                f"/api/tasks/{task.id}/status",
                json={"status": status, "comment": comment},
                headers=env.dispatcher.headers,
            )
        texts = [row["text"] for row in _events(db_session, "sms_send")]
        assert len(texts) == 2
        assert "выполнена" in texts[1]

    def test_no_sms_without_key_or_mobile(self, client: TestClient, db_session):
        env = _org(client, db_session, "SmsOff")
        db_session.add(
            OrganizationSettingsModel(organization_id=env.org.id, sms_enabled=True)
        )
        db_session.commit()
        client.post(
            "/api/tasks",
            json={
                "title": "Без ключа",
                "address": "ул. Невская, 9",
                "customer_phone": "+79110000000",
            },
            headers=env.dispatcher.headers,
        )
        assert _events(db_session, "sms_send") == []

    def test_settings_keep_key_write_only(self, client: TestClient, db_session):
        from app.schemas.organization_settings import OrganizationSettingsUpdate
        from app.services.organization_settings_service import (
            get_organization_settings,
            update_organization_settings,
        )

        env = _org(client, db_session, "SmsCfg")
        current = get_organization_settings(db_session, env.org.id)
        assert current.sms_configured is False
        assert current.telegram_available is True
        data = current.model_dump(include=set(OrganizationSettingsUpdate.model_fields))
        saved = update_organization_settings(
            db_session,
            env.org.id,
            OrganizationSettingsUpdate(
                **{**data, "sms_enabled": True, "sms_api_id": "K"}
            ),
        )
        assert saved.sms_configured is True
        assert "K" not in saved.model_dump_json()
        # null — ключ не трогаем, "" — удаляем
        kept = update_organization_settings(
            db_session, env.org.id, OrganizationSettingsUpdate(**data)
        )
        assert kept.sms_configured is True
        cleared = update_organization_settings(
            db_session,
            env.org.id,
            OrganizationSettingsUpdate(**{**data, "sms_api_id": ""}),
        )
        assert cleared.sms_configured is False


def test_normalize_phone():
    assert applicant_notify.normalize_phone("+7 (911) 000-00-00") == "79110000000"
    assert applicant_notify.normalize_phone("89110000000") == "79110000000"
    assert applicant_notify.normalize_phone("9110000000") == "79110000000"
    assert applicant_notify.normalize_phone("+7 812 555-12-12") is None
    assert applicant_notify.normalize_phone(None) is None


def test_send_telegram_ignores_blocked_chat(monkeypatch):
    calls = []

    class Response:
        def __init__(self, code):
            self.status_code = code

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json):
            calls.append((url, json))
            return Response(403 if json["chat_id"] == "blocked" else 502)

    monkeypatch.setattr(applicant_notify.httpx, "AsyncClient", FakeClient)
    asyncio.run(applicant_notify.send_telegram("blocked", "hi"))
    with pytest.raises(applicant_notify.DeliveryError):
        asyncio.run(applicant_notify.send_telegram("1", "hi"))
    assert calls[0][0].endswith(f"bot{BOT_TOKEN}/sendMessage")


def test_planned_date_notifies_only_when_day_changes(client, db_session):
    env = _org(client, db_session, "PlanOrg")
    token = _link(client, env)["token"]
    _subscribe(client, token)
    url = f"/api/tasks/{env.task.id}/planned-date"
    headers = env.dispatcher.headers
    for value in ("2026-11-07T09:00:00Z", "2026-11-07T12:00:00+03:00"):
        response = client.patch(url, json={"planned_date": value}, headers=headers)
        assert response.status_code == 200, response.text
    messages = _events(db_session, "telegram_send")
    assert len(messages) == 1
    assert "07.11.2026" in messages[0]["text"]
