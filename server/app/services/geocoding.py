"""
Geocoding Service
=================
Сервис геокодирования адресов с кэшированием.
"""

import re
from typing import Optional, Tuple

from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

from app.config import settings
from app.models.enums import TaskPriority


class GeocodingService:
    """Сервис геокодирования адресов с кэшированием"""
    
    def __init__(self):
        self.geolocator = Nominatim(
            user_agent=settings.GEOCODING_USER_AGENT,
            timeout=settings.GEOCODING_TIMEOUT
        )
        self._cache: dict[str, Tuple[float, float]] = {}
        self._cache_max_size = settings.GEOCODING_CACHE_SIZE
    
    @property
    def cache_size(self) -> int:
        """Размер кэша"""
        return len(self._cache)
    
    def _get_from_cache(self, key: str) -> Optional[Tuple[float, float]]:
        """Получить координаты из кэша"""
        return self._cache.get(key)
    
    def _add_to_cache(self, key: str, coords: Tuple[float, float]):
        """Добавить координаты в кэш"""
        if len(self._cache) >= self._cache_max_size:
            # Удаляем первые 100 записей (FIFO-like)
            keys_to_remove = list(self._cache.keys())[:100]
            for k in keys_to_remove:
                del self._cache[k]
        self._cache[key] = coords
    
    def extract_priority(self, text: str) -> str:
        """
        Извлекает приоритет из текста заявки.
        Возвращает: 1=Плановая, 2=Текущая, 3=Срочная, 4=Аварийная
        """
        text_lower = text.lower()
        if 'аварийн' in text_lower:
            return TaskPriority.EMERGENCY.value
        elif 'срочн' in text_lower:
            return TaskPriority.URGENT.value
        elif 'текущ' in text_lower:
            return TaskPriority.CURRENT.value
        else:
            return TaskPriority.PLANNED.value
    
    def extract_task_number(self, text: str) -> str:
        """Извлекает номер заявки из текста
        
        Форматы: [1170773], №1138996, #1138996, Заявка 1138996
        """
        patterns = [
            r'\[(\d{5,10})\]',
            r'№\s*(\d{5,10})',
            r'#(\d{5,10})',
            r'заявка\s*(\d{5,10})',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return ""
    
    def normalize_address(self, address: str) -> str:
        """Нормализация адреса для геокодирования"""
        result = address
        
        replacements = [
            # Регионы
            (r'Лен\.?\s*обл\.?', 'Ленинградская область'),
            (r'\bЛ\.?О\.?\b', 'Ленинградская область'),
            (r'\bСПб\b', 'Санкт-Петербург'),
            (r'\bС-Пб\b', 'Санкт-Петербург'),
            (r'\bМск\b', 'Москва'),
            # Населённые пункты
            (r'\bгп\.?\s+', ''),
            (r'\bг\.п\.?\s+', ''),
            (r'\bпос\.\s+', ''),
            # Улицы
            (r'\bул\.\s*', 'улица '),
            (r'\bпр\.\s*', 'проспект '),
            (r'\bпр-т\.?\s*', 'проспект '),
            (r'\bш\.\s*', 'шоссе '),
            (r'\bбул\.\s*', 'бульвар '),
            (r'\bпер\.\s*', 'переулок '),
            (r'\bнаб\.\s*', 'набережная '),
            # Дома
            (r'\bд\.\s*', 'дом '),
            (r'\bкорп\.\s*(\d)', r'корпус \1'),
            (r'\bк\.\s*(\d)', r'корпус \1'),
            (r'\bстр\.\s*(\d)', r'строение \1'),
            (r'\bлит\.\s*', 'литера '),
        ]
        
        for pattern, replacement in replacements:
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
        
        # Удаляем лишние данные
        cleanup_patterns = [
            r',?\s*подъезд\s*[^\.,]*',
            r',?\s*кв\.?\s*\d+',
            r'\+?\d{10,11}',
            r'\d{3}-\d{2}-\d{2}',
            r'заявка\s*№?\s*\d+',
            r'№\s*\d+',
            r'\b(Плановая|Текущая|Срочная|Аварийная)\.?',
            r'\d+\s*шт',
            r',\s*\d+\s*,',
            r',\s*\d+\s*$',
            r'деньги\s+у\s+\S+',
            r'\(Диспетчер[^)]*\)',
            r'Доп\.?\s*инф\.?:.*',
        ]
        
        for pattern in cleanup_patterns:
            result = re.sub(pattern, '', result, flags=re.IGNORECASE)
        
        # Удаляем описание проблемы
        parts = result.split('.')
        address_parts = []
        problem_keywords = ['работает', 'сломан', 'вызов', 'брелок', 'ключ', 'карт', 
                          'трубк', 'замен', 'ремонт', 'открыт', 'закрыт', 'программ', 
                          'домофон', 'почта', 'мусор', 'этаж', 'дверь', 'двери']
        
        for part in parts:
            part = part.strip()
            if not part or re.match(r'^\d+$', part):
                continue
            if any(kw in part.lower() for kw in problem_keywords):
                continue
            address_parts.append(part)
        
        result = ', '.join(address_parts) if address_parts else result
        result = re.sub(r'\s+', ' ', result).strip(' ,.')
        result = re.sub(r'\s*,\s*', ', ', result)
        
        return result
    
    def geocode(self, address: str) -> Tuple[float, float]:
        """Геокодировать адрес в координаты"""
        normalized = self.normalize_address(address)
        
        # Проверяем кэш
        cached = self._get_from_cache(normalized)
        if cached:
            # print(f"Geocoding (cached): '{address[:50]}...' -> {cached}")
            return cached
        
        # print(f"Geocoding: '{address[:80]}...' -> '{normalized}'")
        
        try:
            # Извлекаем компоненты
            street_match = re.search(
                r'(\S+)\s+(улица|проспект|шоссе|бульвар|переулок|набережная)', 
                normalized, re.IGNORECASE
            )
            if not street_match:
                street_match = re.search(
                    r'(улица|проспект|шоссе|бульвар|переулок|набережная)\s+(\S+)', 
                    normalized, re.IGNORECASE
                )
            
            house_match = re.search(r'(?:дом|д\.?)\s*(\d+)', normalized, re.IGNORECASE)
            corp_match = re.search(r'(?:корпус|корп\.?|к\.?)\s*(\d+)', normalized, re.IGNORECASE)
            
            # Определяем город
            city = "Санкт-Петербург"  # По умолчанию
            region = None
            
            if "санкт-петербург" in normalized.lower() or "спб" in normalized.lower():
                city = "Санкт-Петербург"
            elif "ленинградская" in normalized.lower():
                region = "Ленинградская область"
                settlement = re.search(r'область\s+(\S+)', normalized, re.IGNORECASE)
                if settlement:
                    city = settlement.group(1).strip(',.')
            elif "москва" in normalized.lower() or "мск" in normalized.lower():
                city = "Москва"
            
            # Пробуем оптимизированный запрос
            if street_match and house_match:
                if street_match.group(2).lower() in ['улица', 'проспект', 'шоссе', 'бульвар', 'переулок', 'набережная']:
                    street_type = street_match.group(2)
                    street_name = street_match.group(1)
                else:
                    street_type = street_match.group(1)
                    street_name = street_match.group(2)
                
                house_num = house_match.group(1)
                if corp_match:
                    house_num += f"к{corp_match.group(1)}"
                
                optimized = f"{street_name} {street_type} {house_num}, {city}"
                if region:
                    optimized += f", {region}"
                optimized += ", Россия"
                
                print(f"   🔄 Trying: '{optimized}'")
                location = self.geolocator.geocode(optimized)
                if location:
                    coords = (location.latitude, location.longitude)
                    self._add_to_cache(normalized, coords)
                    print(f"   ✅ Found: {coords}")
                    return coords
                
                # Без корпуса
                if corp_match:
                    optimized_no_corp = f"{street_name} {street_type} {house_match.group(1)}, {city}"
                    if region:
                        optimized_no_corp += f", {region}"
                    optimized_no_corp += ", Россия"
                    location = self.geolocator.geocode(optimized_no_corp)
                    if location:
                        coords = (location.latitude, location.longitude)
                        self._add_to_cache(normalized, coords)
                        return coords
            
            # Пробуем нормализованный
            location = self.geolocator.geocode(normalized)
            if location:
                coords = (location.latitude, location.longitude)
                self._add_to_cache(normalized, coords)
                return coords
            
            # С "Россия"
            location = self.geolocator.geocode(f"{normalized}, Россия")
            if location:
                coords = (location.latitude, location.longitude)
                self._add_to_cache(normalized, coords)
                return coords
                    
        except (GeocoderTimedOut, GeocoderServiceError) as e:
            pass  # Geocoding timeout/error
        except Exception as e:
            pass  # Geocoding error
        
        # Location not found - return default
        return (0.0, 0.0)


# Singleton
geocoding_service = GeocodingService()
