"""
Tests for GeocodingService
==========================
Тесты сервиса геокодирования.
"""

import pytest
from unittest.mock import MagicMock

from app.services.geocoding import GeocodingService


class TestExtractPriority:
    """Тесты извлечения приоритета из текста."""
    
    def test_emergency_priority(self):
        """Аварийная заявка."""
        service = GeocodingService()
        assert service.extract_priority("Аварийная заявка") == "EMERGENCY"
        assert service.extract_priority("АВАРИЙНАЯ") == "EMERGENCY"
        assert service.extract_priority("Аварийный вызов, течь") == "EMERGENCY"
    
    def test_urgent_priority(self):
        """Срочная заявка."""
        service = GeocodingService()
        assert service.extract_priority("Срочная заявка") == "URGENT"
        assert service.extract_priority("СРОЧНО!") == "URGENT"
    
    def test_current_priority(self):
        """Текущая заявка."""
        service = GeocodingService()
        assert service.extract_priority("Текущая заявка") == "CURRENT"
        assert service.extract_priority("ТЕКУЩЕЕ обслуживание") == "CURRENT"
    
    def test_default_priority(self):
        """Плановая по умолчанию."""
        service = GeocodingService()
        assert service.extract_priority("Обычная заявка") == "PLANNED"
        assert service.extract_priority("") == "PLANNED"
        assert service.extract_priority("Плановый ремонт") == "PLANNED"


class TestExtractTaskNumber:
    """Тесты извлечения номера заявки."""
    
    def test_square_brackets_format(self):
        """Формат [1170773]."""
        service = GeocodingService()
        assert service.extract_task_number("[1170773] Заявка") == "1170773"
    
    def test_number_sign_format(self):
        """Формат №1138996."""
        service = GeocodingService()
        assert service.extract_task_number("Заявка №1138996") == "1138996"
        assert service.extract_task_number("№ 1138996") == "1138996"
    
    def test_hash_format(self):
        """Формат #1138996."""
        service = GeocodingService()
        assert service.extract_task_number("#1138996 срочно") == "1138996"
    
    def test_word_format(self):
        """Формат 'Заявка 1138996'."""
        service = GeocodingService()
        assert service.extract_task_number("Заявка 1138996") == "1138996"
        assert service.extract_task_number("ЗАЯВКА 1138996") == "1138996"
    
    def test_no_number(self):
        """Номер не найден."""
        service = GeocodingService()
        assert service.extract_task_number("Просто текст") == ""
        assert service.extract_task_number("") == ""
    
    def test_short_number_ignored(self):
        """Короткие номера игнорируются."""
        service = GeocodingService()
        assert service.extract_task_number("[123]") == ""


class TestNormalizeAddress:
    """Тесты нормализации адресов."""
    
    def test_expand_street_abbreviations(self):
        """Раскрытие сокращений улиц."""
        service = GeocodingService()
        assert "улица" in service.normalize_address("ул. Ленина 10")
        assert "проспект" in service.normalize_address("пр. Невский 100")
        assert "шоссе" in service.normalize_address("ш. Выборгское 5")
    
    def test_expand_house_abbreviations(self):
        """Раскрытие сокращений домов."""
        service = GeocodingService()
        assert "дом" in service.normalize_address("ул. Ленина д. 10")
        assert "корпус" in service.normalize_address("ул. Ленина д.10 к.2")
    
    def test_expand_city_abbreviations(self):
        """Раскрытие сокращений городов."""
        service = GeocodingService()
        assert "Санкт-Петербург" in service.normalize_address("СПб ул. Ленина 1")
        assert "Ленинградская область" in service.normalize_address("Лен. обл. Всеволожск")
    
    def test_remove_phone_numbers(self):
        """Удаление телефонов."""
        service = GeocodingService()
        result = service.normalize_address("ул. Ленина 10 +79219876543")
        assert "+79219876543" not in result
        assert "9219876543" not in result
    
    def test_remove_apartment_numbers(self):
        """Удаление номеров квартир."""
        service = GeocodingService()
        result = service.normalize_address("ул. Ленина 10 кв. 25")
        assert "кв" not in result
        assert "25" not in result
    
    def test_remove_priority_keywords(self):
        """Удаление ключевых слов приоритета."""
        service = GeocodingService()
        result = service.normalize_address("Плановая. ул. Ленина 10")
        assert "Плановая" not in result


class TestGeocodingCache:
    """Тесты кэширования."""
    
    def test_cache_initially_empty(self):
        """Кэш изначально пуст."""
        service = GeocodingService()
        assert service.cache_size == 0
    
    def test_add_to_cache(self):
        """Добавление в кэш."""
        service = GeocodingService()
        service._add_to_cache("test_address", (59.9343, 30.3351))
        assert service.cache_size == 1
    
    def test_get_from_cache(self):
        """Получение из кэша."""
        service = GeocodingService()
        coords = (59.9343, 30.3351)
        service._add_to_cache("test_address", coords)
        assert service._get_from_cache("test_address") == coords
    
    def test_cache_miss(self):
        """Промах кэша."""
        service = GeocodingService()
        assert service._get_from_cache("nonexistent") is None
    
    def test_cache_overflow(self):
        """Переполнение кэша (FIFO очистка)."""
        service = GeocodingService()
        service._cache_max_size = 10  # Маленький размер для теста
        
        # Добавляем больше записей, чем максимум
        for i in range(15):
            service._add_to_cache(f"address_{i}", (59.0 + i * 0.01, 30.0 + i * 0.01))
        
        # Размер должен быть меньше или равен максимуму после очистки
        assert service.cache_size <= 10


class TestGeocodeMock:
    """Тесты геокодирования с моками."""
    
    def test_geocode_cached_result(self):
        """Кэшированный результат возвращается без вызова API."""
        service = GeocodingService()
        # Добавляем в кэш по нормализованному ключу
        normalized = service.normalize_address("test address")
        service._cache[normalized] = (59.9343, 30.3351)
        
        result = service.geocode("test address")
        
        assert result == (59.9343, 30.3351)
    
    def test_geocode_api_success(self):
        """Успешное геокодирование через API (мок geolocator)."""
        service = GeocodingService()
        
        mock_location = MagicMock()
        mock_location.latitude = 59.9343
        mock_location.longitude = 30.3351
        service.geolocator = MagicMock()
        service.geolocator.geocode = MagicMock(return_value=mock_location)
        
        result = service.geocode("Санкт-Петербург, Невский проспект 1")
        
        assert result[0] == 59.9343
        assert result[1] == 30.3351
    
    def test_geocode_not_found(self):
        """Адрес не найден."""
        service = GeocodingService()
        service.geolocator = MagicMock()
        service.geolocator.geocode = MagicMock(return_value=None)
        
        result = service.geocode("несуществующий адрес xyz")
        
        assert result == (0.0, 0.0)


class TestServiceSingleton:
    """Тесты синглтона."""
    
    def test_singleton_imported(self):
        """Синглтон импортируется."""
        from app.services.geocoding import geocoding_service
        assert geocoding_service is not None
        assert isinstance(geocoding_service, GeocodingService)
