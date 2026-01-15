"""Tests for task_parser service."""
import pytest
from app.services.task_parser import (
    ParsedTask,
    parse_dispatcher_format,
    parse_standard_format,
    parse_dispatcher_message,
)


class TestParseDispatcherFormat:
    """Tests for parse_dispatcher_format function."""

    def test_basic_dispatcher_format(self):
        """Test basic dispatcher message parsing."""
        text = "№1173544 Текущая. Центральная ул., д.3, подъезд 1. Брелки. Не работает брелок."
        result = parse_dispatcher_format(text)
        
        assert result is not None
        assert result.external_id == "1173544"
        assert result.priority == 2  # Текущая
        assert "Центральная" in result.address
        assert "подъезд 1" in result.address
        assert "Брелки" in result.title

    def test_urgent_priority(self):
        """Test urgent priority parsing."""
        text = "№123456 Срочная. ул. Ленина, д.15, подъезд 2. Замок. Сломан замок."
        result = parse_dispatcher_format(text)
        
        assert result is not None
        assert result.priority == 3  # Срочная

    def test_emergency_priority(self):
        """Test emergency priority parsing."""
        text = "№654321 Аварийная. пр. Мира, д.20, подъезд 3. Затопление. Вода течёт."
        result = parse_dispatcher_format(text)
        
        assert result is not None
        assert result.priority == 4  # Аварийная

    def test_planned_priority(self):
        """Test planned priority parsing."""
        text = "№111222 Плановая. Садовая ул., д.5, подъезд 1. Осмотр. Плановый осмотр."
        result = parse_dispatcher_format(text)
        
        assert result is not None
        assert result.priority == 1  # Плановая

    def test_phone_extraction(self):
        """Test phone number extraction."""
        text = "№123 Текущая. Адрес, подъезд 1. Работа. Описание. +79110001122"
        result = parse_dispatcher_format(text)
        
        assert result is not None
        assert result.contact_phone == "+79110001122"

    def test_phone_without_plus(self):
        """Test phone number without + prefix."""
        text = "№123 Текущая. Адрес, подъезд 1. Работа. Описание. 79110001122"
        result = parse_dispatcher_format(text)
        
        assert result is not None
        assert result.contact_phone == "79110001122"

    def test_apartment_extraction(self):
        """Test apartment number extraction."""
        text = "№123 Текущая. Адрес, подъезд 1. Работа. Описание. кв.45"
        result = parse_dispatcher_format(text)
        
        assert result is not None
        assert result.apartment == "45"
        assert "кв. 45" in result.address

    def test_apartment_without_dot(self):
        """Test apartment extraction without dot (кв45)."""
        text = "№123 Текущая. Адрес, подъезд 1. Работа. кв123"
        result = parse_dispatcher_format(text)
        
        assert result is not None
        assert result.apartment == "123"

    def test_full_message_with_all_fields(self):
        """Test full dispatcher message with all fields."""
        text = (
            "№1173544 Текущая. Центральная ул., д.3, корп. 1, "
            "Лен. обл. гп. Новоселье, подъезд 1. "
            "Брелки, ключи, карты. Не работает брелок на парковку. "
            "кв.45 +79110267493 Иванов Иван"
        )
        result = parse_dispatcher_format(text)
        
        assert result is not None
        assert result.external_id == "1173544"
        assert result.priority == 2
        assert result.contact_phone == "+79110267493"
        assert result.apartment == "45"
        assert "[1173544]" in result.title

    def test_not_dispatcher_format(self):
        """Test that non-dispatcher messages return None."""
        text = "Обычное сообщение без номера заявки"
        result = parse_dispatcher_format(text)
        
        assert result is None

    def test_empty_string(self):
        """Test empty string handling."""
        result = parse_dispatcher_format("")
        assert result is None

    def test_whitespace_only(self):
        """Test whitespace-only string handling."""
        result = parse_dispatcher_format("   \n\t  ")
        assert result is None


class TestParseStandardFormat:
    """Tests for parse_standard_format function."""

    def test_two_lines(self):
        """Test two-line format: address + description."""
        text = "ул. Ленина, д.10\nНе работает домофон"
        result = parse_standard_format(text)
        
        assert result is not None
        assert result.address == "ул. Ленина, д.10"
        assert "домофон" in result.description

    def test_single_line(self):
        """Test single line - used as both address and description."""
        text = "Срочный ремонт на Невском проспекте"
        result = parse_standard_format(text)
        
        assert result is not None
        assert result.address == text
        assert result.description == text

    def test_multiline(self):
        """Test multiline: first line is address, rest is description."""
        text = "Московский пр., д.5\nПроблема с электричеством\nТребуется замена проводки"
        result = parse_standard_format(text)
        
        assert result is not None
        assert result.address == "Московский пр., д.5"
        assert "электричеством" in result.description
        assert "проводки" in result.description

    def test_with_phone(self):
        """Test phone extraction in standard format."""
        text = "Адрес улица\nОписание проблемы +79998887766"
        result = parse_standard_format(text)
        
        assert result is not None
        assert result.contact_phone == "+79998887766"

    def test_empty_lines_filtered(self):
        """Test that empty lines are filtered out."""
        text = "Адрес\n\n\nОписание"
        result = parse_standard_format(text)
        
        assert result is not None
        assert result.address == "Адрес"
        assert result.description == "Описание"


class TestParseDispatcherMessage:
    """Tests for main parse_dispatcher_message function."""

    def test_dispatcher_format_detected(self):
        """Test that dispatcher format is detected."""
        text = "№123 Текущая. Адрес, подъезд 1. Работа."
        result = parse_dispatcher_message(text)
        
        assert result["success"] is True
        assert result["data"]["external_id"] == "123"

    def test_standard_format_fallback(self):
        """Test fallback to standard format."""
        text = "Обычный адрес\nОписание работы"
        result = parse_dispatcher_message(text)
        
        assert result["success"] is True
        assert result["data"]["address"] == "Обычный адрес"

    def test_empty_returns_error(self):
        """Test empty text returns error dict."""
        result = parse_dispatcher_message("")
        assert result["success"] is False
        assert "error" in result

    def test_none_input_returns_error(self):
        """Test None input returns error dict."""
        result = parse_dispatcher_message(None)
        assert result["success"] is False
        assert "error" in result

    def test_short_text_returns_error(self):
        """Test very short text returns error."""
        result = parse_dispatcher_message("abc")
        assert result["success"] is False
        assert "error" in result

    def test_returns_dict_with_data(self):
        """Test successful parse returns dict with data."""
        text = "№456 Срочная. Тестовый адрес, подъезд 2. Категория."
        result = parse_dispatcher_message(text)
        
        assert result["success"] is True
        assert "data" in result
        assert result["data"]["title"] is not None
        assert result["data"]["address"] is not None


class TestParsedTaskDataclass:
    """Tests for ParsedTask dataclass."""

    def test_default_priority(self):
        """Test default priority is 2 (Текущая)."""
        task = ParsedTask(title="Test", address="Addr", description="Desc")
        assert task.priority == 2

    def test_to_dict(self):
        """Test to_dict conversion."""
        task = ParsedTask(
            title="Title",
            address="Address",
            description="Description",
            external_id="12345",
            contact_phone="+79001234567",
            apartment="10",
            priority=3
        )
        d = task.to_dict()
        
        assert d["title"] == "Title"
        assert d["address"] == "Address"
        assert d["description"] == "Description"
        assert d["external_id"] == "12345"
        assert d["contact_phone"] == "+79001234567"
        assert d["apartment"] == "10"
        assert d["priority"] == 3

    def test_optional_fields_none(self):
        """Test optional fields default to None."""
        task = ParsedTask(title="T", address="A", description="D")
        
        assert task.external_id is None
        assert task.contact_phone is None
        assert task.contact_name is None
        assert task.apartment is None
