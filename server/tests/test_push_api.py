"""
Web Push API Tests
==================
Подписки браузера (Push API / VAPID) и таргетинг web-push при отправке
сообщения (только офлайн + не-замьютившие участники).
"""

from app.config import settings


class TestPushSubscriptionApi:
    def _subscribe(self, client, auth_headers, endpoint="https://push.example/abc"):
        return client.post(
            "/api/push/subscribe",
            json={
                "endpoint": endpoint,
                "keys": {"p256dh": "p256dh_key", "auth": "auth_key"},
            },
            headers=auth_headers,
        )

    def test_vapid_public_key(self, client, auth_headers):
        resp = client.get("/api/push/vapid-public-key", headers=auth_headers)
        assert resp.status_code == 200
        assert "public_key" in resp.json()
        assert "enabled" in resp.json()

    def test_subscribe_creates_subscription(self, client, auth_headers, db_session):
        from app.models import PushSubscriptionModel

        resp = self._subscribe(client, auth_headers)
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        count = (
            db_session.query(PushSubscriptionModel)
            .filter(PushSubscriptionModel.endpoint == "https://push.example/abc")
            .count()
        )
        assert count == 1

    def test_subscribe_is_idempotent_by_endpoint(
        self, client, auth_headers, db_session
    ):
        from app.models import PushSubscriptionModel

        self._subscribe(client, auth_headers)
        self._subscribe(client, auth_headers)  # тот же endpoint

        count = (
            db_session.query(PushSubscriptionModel)
            .filter(PushSubscriptionModel.endpoint == "https://push.example/abc")
            .count()
        )
        assert count == 1

    def test_unsubscribe_removes_subscription(self, client, auth_headers, db_session):
        from app.models import PushSubscriptionModel

        self._subscribe(client, auth_headers)
        resp = client.post(
            "/api/push/unsubscribe",
            json={"endpoint": "https://push.example/abc"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        count = (
            db_session.query(PushSubscriptionModel)
            .filter(PushSubscriptionModel.endpoint == "https://push.example/abc")
            .count()
        )
        assert count == 0

    def test_subscribe_requires_auth(self, client):
        resp = self._subscribe(client, {})
        assert resp.status_code in (401, 403)


class TestWebPushTargeting:
    def test_message_web_push_skips_online_and_muted(
        self,
        client,
        auth_headers,
        db_session,
        admin_user,
        worker_user,
        dispatcher_user,
        monkeypatch,
    ):
        """Web push уходит только офлайн и не-замьютившим участникам."""
        from app.models.chat import ConversationMemberModel
        from app.services import chat_service

        # Форсим включённый web push независимо от .env окружения.
        monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "pub")
        monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "priv")

        # Перехватываем отправку web-push вместо реальной доставки.
        captured = {}

        def fake_send_web_push(*, title, body, url, user_ids, extra_data=None):
            captured["user_ids"] = user_ids
            return {"success": True}

        monkeypatch.setattr("app.services.send_web_push", fake_send_web_push)

        # Групповой чат: admin (отправитель), worker (офлайн, не мьют),
        # dispatcher (замьютил).
        conv = chat_service.create_conversation(
            db_session,
            conv_type="group",
            creator_id=admin_user.id,
            organization_id=None,
            name="Team",
            member_user_ids=[worker_user.id, dispatcher_user.id],
        )
        db_session.query(ConversationMemberModel).filter(
            ConversationMemberModel.conversation_id == conv.id,
            ConversationMemberModel.user_id == dispatcher_user.id,
        ).update({ConversationMemberModel.is_muted: True})
        db_session.commit()

        resp = client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            json={"text": "hello team"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

        # Никто не онлайн (нет WS) → офлайн все; dispatcher замьютил, admin — автор.
        assert captured.get("user_ids") == [worker_user.id]
