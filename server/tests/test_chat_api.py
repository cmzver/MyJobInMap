"""
Chat API Tests
==============
Тесты для REST API чата: разговоры, сообщения, реакции, прочтение.
"""

from pathlib import Path

import pytest

from app.config import settings

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def second_user(db_session):
    """Второй пользователь для direct-чата."""
    from app.models import UserModel, UserRole
    from app.services.auth import get_password_hash

    user = UserModel(
        username="user2",
        password_hash=get_password_hash("user2"),
        full_name="User Two",
        role=UserRole.WORKER.value,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def second_user_token(client, second_user):
    """JWT-токен для второго пользователя."""
    response = client.post(
        "/api/auth/login",
        data={"username": "user2", "password": "user2"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture
def second_auth_headers(second_user_token):
    return {"Authorization": f"Bearer {second_user_token}"}


@pytest.fixture
def sample_task(db_session, admin_user):
    """Тестовая заявка."""
    from app.models.task import TaskModel

    task = TaskModel(
        title="Test Task",
        raw_address="Test Address",
        description="Test desc",
        status="NEW",
        priority="CURRENT",
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    return task


# ============================================================================
# Conversations: CREATE
# ============================================================================


class TestCreateConversation:
    def test_create_direct_chat(self, client, auth_headers, second_user):
        """Создание direct-чата."""
        resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "direct"

    def test_create_direct_idempotent(self, client, auth_headers, second_user):
        """Повторное создание direct-чата возвращает тот же."""
        resp1 = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        resp2 = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        assert resp1.json()["id"] == resp2.json()["id"]

    def test_create_group_chat(self, client, auth_headers, second_user):
        """Создание группового чата."""
        resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "name": "Test Group",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "group"
        assert data["name"] == "Test Group"

    def test_create_group_requires_name(self, client, auth_headers):
        """Группа без имени — ошибка."""
        resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "member_user_ids": [],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_create_direct_requires_one_member(self, client, auth_headers):
        """Direct без собеседника — ошибка."""
        resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_create_direct_self_chat_forbidden(self, client, auth_headers, admin_user):
        """Нельзя создать чат с самим собой."""
        resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [admin_user.id],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_create_task_chat(self, client, auth_headers, sample_task):
        """Создание чата по заявке."""
        resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "task",
                "task_id": sample_task.id,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["task_id"] == sample_task.id

    def test_create_task_chat_idempotent(self, client, auth_headers, sample_task):
        """Повторное создание чата по заявке — тот же."""
        resp1 = client.post(
            "/api/chat/conversations",
            json={
                "type": "task",
                "task_id": sample_task.id,
            },
            headers=auth_headers,
        )
        resp2 = client.post(
            "/api/chat/conversations",
            json={
                "type": "task",
                "task_id": sample_task.id,
            },
            headers=auth_headers,
        )
        assert resp1.json()["id"] == resp2.json()["id"]

    def test_unauthenticated_rejected(self, client):
        """Без токена — 401."""
        resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [999],
            },
        )
        assert resp.status_code in (401, 403)


# ============================================================================
# Conversations: LIST / GET
# ============================================================================


class TestListConversations:
    def test_list_empty(self, client, auth_headers):
        """Пустой список чатов."""
        resp = client.get("/api/chat/conversations", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_after_create(self, client, auth_headers, second_user):
        """Чат появляется в списке после создания."""
        client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )

        resp = client.get("/api/chat/conversations", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["type"] == "direct"

    def test_get_conversation_detail(self, client, auth_headers, second_user):
        """Детали чата включают участников."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        resp = client.get(f"/api/chat/conversations/{conv_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["members"]) == 2

    def test_get_nonexistent_conversation(self, client, auth_headers):
        """Несуществующий чат — 404."""
        resp = client.get("/api/chat/conversations/99999", headers=auth_headers)
        assert resp.status_code in (403, 404)

    def test_non_member_cannot_view(
        self, client, auth_headers, second_user, second_auth_headers, worker_user
    ):
        """Неучастник не видит чат."""
        from app.models import UserModel
        from app.services.auth import get_password_hash

        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        # Worker не участник
        worker_resp = client.post(
            "/api/auth/login",
            data={"username": "worker", "password": "worker"},
        )
        if worker_resp.status_code == 200:
            worker_headers = {
                "Authorization": f"Bearer {worker_resp.json()['access_token']}"
            }
            resp = client.get(
                f"/api/chat/conversations/{conv_id}", headers=worker_headers
            )
            assert resp.status_code == 403


# ============================================================================
# Conversations: UPDATE / MEMBERS
# ============================================================================


class TestConversationManagement:
    def test_update_group_name(self, client, auth_headers, second_user):
        """Переименование группового чата."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "name": "Old Name",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        resp = client.patch(
            f"/api/chat/conversations/{conv_id}",
            json={
                "name": "New Name",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

        messages_resp = client.get(
            f"/api/chat/conversations/{conv_id}/messages",
            headers=auth_headers,
        )
        assert messages_resp.status_code == 200
        items = messages_resp.json()["items"]
        assert any(
            item["message_type"] == "system"
            and item["text"] == 'переименовал(а) чат в "New Name"'
            for item in items
        )

    def test_cannot_rename_direct(self, client, auth_headers, second_user):
        """Нельзя переименовать direct-чат."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        resp = client.patch(
            f"/api/chat/conversations/{conv_id}",
            json={
                "name": "Bad",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_add_members(
        self, client, auth_headers, second_user, worker_user, db_session
    ):
        """Добавление участника в групповой чат."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "name": "Group",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        resp = client.post(
            f"/api/chat/conversations/{conv_id}/members",
            json={
                "user_ids": [worker_user.id],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        member_ids = [m["user_id"] for m in resp.json()]
        assert worker_user.id in member_ids

    def test_remove_member(self, client, auth_headers, second_user):
        """Удаление участника из группового чата (owner удаляет member)."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "name": "Group",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        resp = client.delete(
            f"/api/chat/conversations/{conv_id}/members/{second_user.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    def test_mute_conversation(self, client, auth_headers, second_user):
        """Mute чата."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        resp = client.patch(
            f"/api/chat/conversations/{conv_id}/mute",
            json={
                "is_muted": True,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200

    def test_archive_conversation(self, client, auth_headers, second_user):
        """Archive чата — не показывается в списке."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        client.patch(
            f"/api/chat/conversations/{conv_id}/archive",
            json={
                "is_archived": True,
            },
            headers=auth_headers,
        )

        resp = client.get("/api/chat/conversations", headers=auth_headers)
        assert len(resp.json()) == 0

        # С include_archived — показывается
        resp = client.get(
            "/api/chat/conversations?include_archived=true", headers=auth_headers
        )
        assert len(resp.json()) == 1

    def test_upload_group_avatar(
        self, client, auth_headers, second_user, tmp_path, monkeypatch
    ):
        """Owner может загрузить аватар группового чата."""
        monkeypatch.setattr(type(settings), "BASE_DIR", property(lambda self: tmp_path))

        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "name": "Group",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        resp = client.post(
            f"/api/chat/conversations/{conv_id}/avatar",
            headers=auth_headers,
            files={"avatar": ("group.png", b"fake-image-content", "image/png")},
        )
        assert resp.status_code == 200

        data = resp.json()
        assert data["avatar_url"].startswith(
            f"/api/chat/conversations/{conv_id}/avatar/"
        )

        saved_name = Path(data["avatar_url"]).name
        saved_path = tmp_path / "uploads" / "chat_avatars" / str(conv_id) / saved_name
        assert saved_path.exists()

        file_resp = client.get(data["avatar_url"])
        assert file_resp.status_code == 200
        assert file_resp.content == b"fake-image-content"


class TestConversationManagementWebSocket:
    @staticmethod
    def _mock_ws_auth(monkeypatch, token_map):
        monkeypatch.setattr(
            "app.api.websocket._authenticate_websocket_user",
            lambda token: token_map.get(token),
        )

    def test_ws_receives_conversation_renamed(
        self, client, auth_headers, second_user, monkeypatch
    ):
        """Участник получает websocket event при переименовании группы."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "name": "Old Name",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        self._mock_ws_auth(monkeypatch, {"user2-token": (second_user.id, None, False)})

        with client.websocket_connect("/ws?token=user2-token") as ws:
            resp = client.patch(
                f"/api/chat/conversations/{conv_id}",
                json={
                    "name": "Renamed Group",
                },
                headers=auth_headers,
            )

            assert resp.status_code == 200

            event = ws.receive_json()
            assert event["type"] == "chat_conversation_updated"
            assert event["data"]["conversation_id"] == conv_id
            assert event["data"]["action"] == "conversation_renamed"
            assert event["data"]["name"] == "Renamed Group"

    def test_ws_receives_member_added(
        self, client, auth_headers, second_user, worker_user, monkeypatch
    ):
        """Новый участник получает websocket event при добавлении в чат."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "name": "Group",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        self._mock_ws_auth(monkeypatch, {"worker-token": (worker_user.id, None, False)})

        with client.websocket_connect("/ws?token=worker-token") as ws:
            resp = client.post(
                f"/api/chat/conversations/{conv_id}/members",
                json={
                    "user_ids": [worker_user.id],
                },
                headers=auth_headers,
            )

            assert resp.status_code == 200

            event = ws.receive_json()
            assert event["type"] == "chat_conversation_updated"
            assert event["data"]["conversation_id"] == conv_id
            assert event["data"]["action"] == "member_added"
            assert event["data"]["target_user_id"] == worker_user.id

    def test_ws_receives_member_role_updated(
        self, client, auth_headers, second_user, monkeypatch
    ):
        """Участник получает websocket event при смене роли."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "name": "Group",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        self._mock_ws_auth(monkeypatch, {"user2-token": (second_user.id, None, False)})

        with client.websocket_connect("/ws?token=user2-token") as ws:
            resp = client.patch(
                f"/api/chat/conversations/{conv_id}/members/{second_user.id}",
                json={
                    "role": "admin",
                },
                headers=auth_headers,
            )

            assert resp.status_code == 200

            event = ws.receive_json()
            assert event["type"] == "chat_conversation_updated"
            assert event["data"]["conversation_id"] == conv_id
            assert event["data"]["action"] == "member_role_updated"
            assert event["data"]["target_user_id"] == second_user.id
            assert event["data"]["role"] == "admin"

    def test_ws_receives_ownership_transferred(
        self, client, auth_headers, second_user, monkeypatch
    ):
        """Участник получает websocket event при передаче ownership."""
        create_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "group",
                "name": "Group",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        self._mock_ws_auth(monkeypatch, {"user2-token": (second_user.id, None, False)})

        with client.websocket_connect("/ws?token=user2-token") as ws:
            resp = client.post(
                f"/api/chat/conversations/{conv_id}/transfer-ownership",
                json={
                    "user_id": second_user.id,
                },
                headers=auth_headers,
            )

            assert resp.status_code == 200

            event = ws.receive_json()
            assert event["type"] == "chat_conversation_updated"
            assert event["data"]["conversation_id"] == conv_id
            assert event["data"]["action"] == "ownership_transferred"
            assert event["data"]["target_user_id"] == second_user.id
            assert event["data"]["role"] == "owner"


# ============================================================================
# Messages: SEND / GET
# ============================================================================


class TestMessages:
    def _create_direct(self, client, auth_headers, second_user):
        resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        return resp.json()["id"]

    def test_send_message(self, client, auth_headers, second_user):
        """Отправка текстового сообщения."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Hello!",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Hello!"
        assert data["message_type"] == "text"

    def test_send_empty_text_rejected(self, client, auth_headers, second_user):
        """Пустое текстовое сообщение — ошибка."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": None,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_get_messages(self, client, auth_headers, second_user):
        """Получение сообщений."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        # Отправить 3 сообщения
        for i in range(3):
            client.post(
                f"/api/chat/conversations/{conv_id}/messages",
                json={
                    "text": f"Message {i}",
                },
                headers=auth_headers,
            )

        resp = client.get(
            f"/api/chat/conversations/{conv_id}/messages", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 3
        assert data["has_more"] is False

    def test_messages_cursor_pagination(self, client, auth_headers, second_user):
        """Cursor-пагинация сообщений."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        msg_ids = []
        for i in range(5):
            resp = client.post(
                f"/api/chat/conversations/{conv_id}/messages",
                json={
                    "text": f"Message {i}",
                },
                headers=auth_headers,
            )
            msg_ids.append(resp.json()["id"])

        # Первая страница (limit=2)
        resp = client.get(
            f"/api/chat/conversations/{conv_id}/messages?limit=2",
            headers=auth_headers,
        )
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["has_more"] is True

        # Вторая страница
        before = data["items"][0]["id"]
        resp = client.get(
            f"/api/chat/conversations/{conv_id}/messages?limit=2&before_id={before}",
            headers=auth_headers,
        )
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["has_more"] is True

    def test_reply_to_message(self, client, auth_headers, second_user):
        """Ответ на сообщение."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        msg_resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Original",
            },
            headers=auth_headers,
        )
        msg_id = msg_resp.json()["id"]

        reply_resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Reply",
                "reply_to_id": msg_id,
            },
            headers=auth_headers,
        )
        assert reply_resp.status_code == 200
        data = reply_resp.json()
        assert data["reply_to"] is not None
        assert data["reply_to"]["id"] == msg_id

    def test_edit_message(self, client, auth_headers, second_user):
        """Редактирование сообщения."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        msg_resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Original",
            },
            headers=auth_headers,
        )
        msg_id = msg_resp.json()["id"]

        edit_resp = client.patch(
            f"/api/chat/messages/{msg_id}",
            json={
                "text": "Edited",
            },
            headers=auth_headers,
        )
        assert edit_resp.status_code == 200
        data = edit_resp.json()
        assert data["text"] == "Edited"
        assert data["is_edited"] is True

    def test_edit_others_message_forbidden(
        self, client, auth_headers, second_user, second_auth_headers
    ):
        """Нельзя редактировать чужое сообщение."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        msg_resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Original",
            },
            headers=auth_headers,
        )
        msg_id = msg_resp.json()["id"]

        edit_resp = client.patch(
            f"/api/chat/messages/{msg_id}",
            json={
                "text": "Hacked",
            },
            headers=second_auth_headers,
        )
        assert edit_resp.status_code == 403

    def test_delete_message(self, client, auth_headers, second_user):
        """Soft delete сообщения."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        msg_resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Will be deleted",
            },
            headers=auth_headers,
        )
        msg_id = msg_resp.json()["id"]

        del_resp = client.delete(f"/api/chat/messages/{msg_id}", headers=auth_headers)
        assert del_resp.status_code == 200

        # Проверяем что сообщение помечено как deleted
        list_resp = client.get(
            f"/api/chat/conversations/{conv_id}/messages",
            headers=auth_headers,
        )
        msgs = list_resp.json()["items"]
        deleted_msg = next(m for m in msgs if m["id"] == msg_id)
        assert deleted_msg["is_deleted"] is True
        assert deleted_msg["text"] is None

    def test_search_messages(self, client, auth_headers, second_user):
        """Поиск по сообщениям."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Hello world",
            },
            headers=auth_headers,
        )
        client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Goodbye world",
            },
            headers=auth_headers,
        )
        client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Nothing here",
            },
            headers=auth_headers,
        )

        resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages/search",
            json={
                "query": "world",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_non_member_cannot_send(
        self, client, auth_headers, second_user, worker_user
    ):
        """Неучастник не может отправлять сообщения."""
        conv_id = self._create_direct(client, auth_headers, second_user)

        worker_resp = client.post(
            "/api/auth/login",
            data={"username": "worker", "password": "worker"},
        )
        if worker_resp.status_code == 200:
            worker_headers = {
                "Authorization": f"Bearer {worker_resp.json()['access_token']}"
            }
            resp = client.post(
                f"/api/chat/conversations/{conv_id}/messages",
                json={
                    "text": "Hacked",
                },
                headers=worker_headers,
            )
            assert resp.status_code == 403


# ============================================================================
# Reactions
# ============================================================================


class TestReactions:
    def _setup(self, client, auth_headers, second_user):
        """Создать чат и отправить сообщение."""
        conv_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = conv_resp.json()["id"]

        msg_resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "React to me",
            },
            headers=auth_headers,
        )
        return conv_id, msg_resp.json()["id"]

    def test_add_reaction(self, client, auth_headers, second_user):
        """Добавление реакции."""
        _, msg_id = self._setup(client, auth_headers, second_user)

        resp = client.post(
            f"/api/chat/messages/{msg_id}/reactions",
            json={
                "emoji": "👍",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["emoji"] == "👍"
        assert data[0]["count"] == 1

    def test_toggle_reaction_off(self, client, auth_headers, second_user):
        """Убрать реакцию повторным toggle."""
        _, msg_id = self._setup(client, auth_headers, second_user)

        client.post(
            f"/api/chat/messages/{msg_id}/reactions",
            json={
                "emoji": "👍",
            },
            headers=auth_headers,
        )

        resp = client.post(
            f"/api/chat/messages/{msg_id}/reactions",
            json={
                "emoji": "👍",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 0

    def test_multiple_reactions(
        self, client, auth_headers, second_user, second_auth_headers
    ):
        """Несколько пользователей реагируют."""
        _, msg_id = self._setup(client, auth_headers, second_user)

        client.post(
            f"/api/chat/messages/{msg_id}/reactions",
            json={
                "emoji": "👍",
            },
            headers=auth_headers,
        )

        resp = client.post(
            f"/api/chat/messages/{msg_id}/reactions",
            json={
                "emoji": "👍",
            },
            headers=second_auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["count"] == 2


# ============================================================================
# Read Receipts
# ============================================================================


class TestReadReceipts:
    def test_mark_as_read(self, client, auth_headers, second_user):
        conv_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = conv_resp.json()["id"]

        msg_resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Read me",
            },
            headers=auth_headers,
        )
        msg_id = msg_resp.json()["id"]

        resp = client.post(
            f"/api/chat/conversations/{conv_id}/read",
            json={
                "last_message_id": msg_id,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200

    def test_unread_count(self, client, auth_headers, second_user, second_auth_headers):
        """Непрочитанные сообщения отображаются в списке."""
        conv_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = conv_resp.json()["id"]

        # Admin отправляет сообщение
        client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Unread 1",
            },
            headers=auth_headers,
        )
        client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": "Unread 2",
            },
            headers=auth_headers,
        )

        # Second user видит 2 непрочитанных
        resp = client.get("/api/chat/conversations", headers=second_auth_headers)
        items = resp.json()
        assert len(items) == 1
        assert items[0]["unread_count"] == 2


# ============================================================================
# Task Chat Shortcut
# ============================================================================


class TestTaskChat:
    def test_get_or_create_task_chat(self, client, auth_headers, sample_task):
        """Shortcut создаёт/возвращает чат заявки."""
        resp = client.get(f"/api/chat/task/{sample_task.id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["task_id"] == sample_task.id
        assert data["type"] == "task"

    def test_task_chat_idempotent(self, client, auth_headers, sample_task):
        """Повторный вызов — тот же чат."""
        resp1 = client.get(f"/api/chat/task/{sample_task.id}", headers=auth_headers)
        resp2 = client.get(f"/api/chat/task/{sample_task.id}", headers=auth_headers)
        assert resp1.json()["id"] == resp2.json()["id"]


# ============================================================================
# Mentions
# ============================================================================


class TestMentions:
    def test_mention_in_message(self, client, auth_headers, second_user, db_session):
        """@username создаёт mention."""
        conv_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = conv_resp.json()["id"]

        resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": f"Привет @{second_user.username}!",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["mentions"]) == 1
        assert data["mentions"][0]["username"] == second_user.username

    def test_mention_non_member_ignored(
        self, client, auth_headers, second_user, worker_user
    ):
        """@username неучастника чата — игнорируется."""
        conv_resp = client.post(
            "/api/chat/conversations",
            json={
                "type": "direct",
                "member_user_ids": [second_user.id],
            },
            headers=auth_headers,
        )
        conv_id = conv_resp.json()["id"]

        resp = client.post(
            f"/api/chat/conversations/{conv_id}/messages",
            json={
                "text": f"Привет @{worker_user.username}!",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["mentions"]) == 0
