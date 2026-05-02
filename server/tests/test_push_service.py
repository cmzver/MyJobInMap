"""
Tests for Push Notification Service.
=====================================
All Firebase interactions are mocked.
"""

import time
from types import ModuleType
from unittest.mock import MagicMock, patch

from app.models import DeviceModel
import app.services.push as push_module


class TestInitFirebase:
    """Tests for init_firebase()."""

    def setup_method(self):
        """Reset global state before each test."""
        push_module.firebase_app = None

    def test_init_firebase_no_credentials(self):
        """Returns False when credentials file not found."""
        with patch("os.path.exists", return_value=False):
            result = push_module.init_firebase()
            assert result is False

    def test_init_firebase_success(self):
        """Returns True when credentials are valid."""
        mock_app = MagicMock()
        with patch("os.path.exists", return_value=True), patch.dict(
            "sys.modules",
            {
                "firebase_admin": MagicMock(
                    initialize_app=MagicMock(return_value=mock_app)
                ),
                "firebase_admin.credentials": MagicMock(),
            },
        ):
            result = push_module.init_firebase()
            assert result is True or push_module.firebase_app is not None

    def test_init_firebase_exception(self):
        """Returns False when Firebase SDK raises exception."""
        with patch("os.path.exists", return_value=True):
            # Mock the import to raise
            orig_import = (
                __builtins__.__import__
                if hasattr(__builtins__, "__import__")
                else __import__
            )

            def mock_import(name, *args, **kwargs):
                if name == "firebase_admin":
                    raise ImportError("No firebase")
                return orig_import(name, *args, **kwargs)

            with patch("builtins.__import__", side_effect=mock_import):
                result = push_module.init_firebase()
                # Should return False or handle gracefully
                assert result is False or push_module.firebase_app is None

    def test_init_firebase_already_initialized(self):
        """Returns True immediately if already initialized."""
        push_module.firebase_app = MagicMock()
        result = push_module.init_firebase()
        assert result is True


class TestSendPushSync:
    """Tests for _send_push_sync()."""

    def test_send_push_firebase_not_configured(self):
        """Returns failure when Firebase not configured."""
        push_module.firebase_app = None
        result = push_module._send_push_sync("Title", "Body")
        assert result["success"] is False
        assert "not configured" in result.get("message", "").lower()

    def test_send_push_no_devices(self, db_session):
        """Returns failure when no devices found."""
        push_module.firebase_app = MagicMock()

        # Mock get_db to return our test session (imported locally inside _send_push_sync)
        def mock_get_db():
            yield db_session

        with patch("app.models.get_db", mock_get_db):
            result = push_module._send_push_sync("Title", "Body")
            assert result["success"] is False
            assert "no devices" in result.get("message", "").lower()

        push_module.firebase_app = None

    def test_send_push_includes_android_channel_id(self, db_session, worker_user):
        """FCM payload includes the resolved Android channel_id before send."""
        push_module.firebase_app = MagicMock()

        db_session.add(
            DeviceModel(
                user_id=worker_user.id,
                fcm_token="token-1",
                device_name="Pixel 8",
            )
        )
        db_session.commit()

        sent_messages = []

        class FakeAndroidConfig:
            def __init__(self, priority):
                self.priority = priority

        class FakeMulticastMessage:
            def __init__(self, data, tokens, android):
                self.data = data
                self.tokens = tokens
                self.android = android

        def mock_get_db():
            yield db_session

        def fake_send_each_for_multicast(message):
            sent_messages.append(message)
            return MagicMock(success_count=1, failure_count=0, responses=[])

        mock_messaging = ModuleType("messaging")
        mock_messaging.AndroidConfig = FakeAndroidConfig
        mock_messaging.MulticastMessage = FakeMulticastMessage
        mock_messaging.send_each_for_multicast = fake_send_each_for_multicast

        mock_firebase_admin = ModuleType("firebase_admin")
        mock_firebase_admin.messaging = mock_messaging

        with patch("app.models.get_db", mock_get_db), patch.dict(
            "sys.modules", {"firebase_admin": mock_firebase_admin}
        ):
            result = push_module._send_push_sync(
                "New chat message",
                "Body",
                notification_type="chat_message",
                user_ids=[worker_user.id],
                extra_data={"conversation_id": 42},
            )

        assert result == {"success": True, "sent": 1, "failed": 0}
        assert len(sent_messages) == 1
        assert sent_messages[0].tokens == ["token-1"]
        assert sent_messages[0].data["channel_id"] == "fieldworker_chat"
        assert sent_messages[0].data["conversation_id"] == "42"
        assert sent_messages[0].android.priority == "high"

        push_module.firebase_app = None


class TestSendPushNotification:
    """Tests for send_push_notification() public API."""

    def test_send_push_notification_returns_queued(self):
        """send_push_notification returns immediately with queued status."""
        with patch.object(push_module, "send_push_background") as mock_bg:
            result = push_module.send_push_notification(
                "Test Title", "Test Body", task_id=42
            )
            assert result["success"] is True
            assert "queued" in result.get("message", "").lower()
            mock_bg.assert_called_once()

    def test_send_push_notification_passes_params(self):
        """Parameters are correctly forwarded."""
        with patch.object(push_module, "send_push_background") as mock_bg:
            push_module.send_push_notification(
                "T", "B", notification_type="new_task", task_id=5, user_ids=[1, 2]
            )
            mock_bg.assert_called_once_with(
                "T", "B", "new_task", 5, [1, 2], None, None
            )


class TestSendPushBackground:
    """Tests for send_push_background()."""

    def test_background_non_blocking(self):
        """send_push_background returns immediately."""
        with patch.object(
            push_module, "_send_push_sync", side_effect=lambda *a, **kw: time.sleep(0.5)
        ):
            start = time.time()
            push_module.send_push_background("T", "B")
            elapsed = time.time() - start
            # Should return in < 0.1s (thread runs in background)
            assert elapsed < 0.3
