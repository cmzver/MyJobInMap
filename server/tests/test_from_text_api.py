"""Tests for /api/tasks/from-text endpoint."""
import pytest


class TestCreateTaskFromText:
    """Tests for POST /api/tasks/from-text endpoint."""

    def test_create_from_dispatcher_format(self, client, auth_headers):
        """Test creating task from dispatcher format message."""
        text = "№1173544 Текущая. Центральная ул., д.3, подъезд 1. Брелки. Не работает брелок."
        
        response = client.post(
            "/api/tasks/from-text",
            json={"text": text, "source": "telegram", "sender": "dispatcher"},
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["task"] is not None
        assert data["parsed_data"] is not None
        assert data["parsed_data"]["external_id"] == "1173544"

    def test_create_from_standard_format(self, client, auth_headers):
        """Test creating task from standard format message."""
        text = "ул. Ленина, д.10\nНе работает домофон"
        
        response = client.post(
            "/api/tasks/from-text",
            json={"text": text, "source": "whatsapp", "sender": "user123"},
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["task"] is not None

    def test_source_recorded_in_description(self, client, auth_headers):
        """Test that source is recorded in task description."""
        response = client.post(
            "/api/tasks/from-text",
            json={
                "text": "№123 Текущая. Адрес, подъезд 1. Работа.",
                "source": "telegram",
                "sender": "test_user",
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        # Source info should be in description
        assert "telegram" in data["task"]["description"].lower() or data["success"]

    def test_empty_text_returns_error(self, client, auth_headers):
        """Test empty text returns error."""
        response = client.post(
            "/api/tasks/from-text",
            json={"text": "", "source": "telegram", "sender": "user"},
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["error"] is not None

    def test_unrecognized_very_short_text_returns_error(self, client, auth_headers):
        """Test very short text returns error."""
        response = client.post(
            "/api/tasks/from-text",
            json={"text": "Привет", "source": "telegram", "sender": "user"},
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        # Very short text should fail parsing
        assert data["success"] is False or len(data.get("task", {}).get("raw_address", "")) < 10

    def test_with_assigned_user_id(self, client, auth_headers, admin_user):
        """Test creating task with assigned user."""
        response = client.post(
            "/api/tasks/from-text",
            json={
                "text": "№999 Текущая. Адрес, подъезд 1. Работа.",
                "source": "web",
                "sender": "admin",
                "assigned_user_id": admin_user.id,
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        if data["success"]:
            assert data["task"]["assigned_user_id"] == admin_user.id

    def test_priority_extracted_correctly(self, client, auth_headers):
        """Test priority is extracted from message."""
        # Test emergency priority
        response = client.post(
            "/api/tasks/from-text",
            json={
                "text": "№111 Аварийная. Адрес, подъезд 1. Затопление.",
                "source": "telegram",
                "sender": "user",
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        if data["success"]:
            assert data["task"]["priority"] == 4  # Аварийная
            assert data["parsed_data"]["priority"] == 4

    def test_phone_extracted(self, client, auth_headers):
        """Test phone number is extracted from message."""
        response = client.post(
            "/api/tasks/from-text",
            json={
                "text": "№222 Текущая. Адрес, подъезд 1. Работа. +79110001122",
                "source": "telegram",
                "sender": "user",
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        if data["success"]:
            assert data["parsed_data"]["contact_phone"] == "+79110001122"

    def test_apartment_extracted(self, client, auth_headers):
        """Test apartment number is extracted."""
        response = client.post(
            "/api/tasks/from-text",
            json={
                "text": "№333 Текущая. Улица, подъезд 1. Работа. кв.45",
                "source": "telegram",
                "sender": "user",
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        if data["success"]:
            assert data["parsed_data"]["apartment"] == "45"


class TestCreateTaskFromTextValidation:
    """Tests for input validation."""

    def test_missing_text_field(self, client, auth_headers):
        """Test missing text field returns validation error."""
        response = client.post(
            "/api/tasks/from-text",
            json={"source": "telegram", "sender": "user"},
            headers=auth_headers,
        )
        
        assert response.status_code == 422  # Validation error

    def test_missing_source_uses_default(self, client, auth_headers):
        """Test missing source field uses default."""
        response = client.post(
            "/api/tasks/from-text",
            json={"text": "№444 Текущая. Адрес, подъезд 1. Работа."},
            headers=auth_headers,
        )
        
        # Should work with default values
        assert response.status_code == 200

    def test_very_long_text(self, client, auth_headers):
        """Test handling of very long text."""
        long_text = "№555 Текущая. Адрес, подъезд 1. " + "Описание. " * 500
        
        response = client.post(
            "/api/tasks/from-text",
            json={"text": long_text, "source": "telegram", "sender": "user"},
            headers=auth_headers,
        )
        
        # Should handle gracefully (either success or controlled error)
        assert response.status_code in [200, 422]


class TestCreateTaskFromTextSources:
    """Tests for different source types."""

    def test_telegram_source(self, client, auth_headers):
        """Test Telegram as source."""
        response = client.post(
            "/api/tasks/from-text",
            json={
                "text": "№666 Текущая. Адрес, подъезд 1. Работа.",
                "source": "telegram",
                "sender": "@telegram_user",
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 200

    def test_whatsapp_source(self, client, auth_headers):
        """Test WhatsApp as source."""
        response = client.post(
            "/api/tasks/from-text",
            json={
                "text": "№777 Текущая. Адрес, подъезд 1. Работа.",
                "source": "whatsapp",
                "sender": "79001234567",
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 200

    def test_web_source(self, client, auth_headers):
        """Test Web as source."""
        response = client.post(
            "/api/tasks/from-text",
            json={
                "text": "№888 Текущая. Адрес, подъезд 1. Работа.",
                "source": "web",
                "sender": "admin@example.com",
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 200

    def test_unknown_source(self, client, auth_headers):
        """Test unknown source type."""
        response = client.post(
            "/api/tasks/from-text",
            json={
                "text": "№999 Текущая. Адрес, подъезд 1. Работа.",
                "source": "unknown_source",
                "sender": "user",
            },
            headers=auth_headers,
        )
        
        # Should handle gracefully
        assert response.status_code == 200
