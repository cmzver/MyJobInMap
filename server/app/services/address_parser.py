"""
Address Parser Service
======================
Парсинг полных адресов на составные части и наоборот.

Примеры входных данных:
- "Ленинский пр. , д. 82, корп. 3, СПб"
- "г. Санкт-Петербург, ул. Невский проспект, д. 1"
- "Центральная ул., д.3, корп. 1, Лен. обл. гп. Новоселье"
"""

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class ParsedAddress:
    """Распарсенный адрес."""
    city: Optional[str] = None
    street: Optional[str] = None
    building: Optional[str] = None
    corpus: Optional[str] = None
    entrance: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            "city": self.city,
            "street": self.street,
            "building": self.building,
            "corpus": self.corpus,
            "entrance": self.entrance,
        }


# Словарь сокращений городов
CITY_ALIASES = {
    "спб": "Санкт-Петербург",
    "санкт-петербург": "Санкт-Петербург",
    "с.-петербург": "Санкт-Петербург",
    "с-петербург": "Санкт-Петербург",
    "питер": "Санкт-Петербург",
    "петербург": "Санкт-Петербург",
    "мск": "Москва",
    "москва": "Москва",
}

# Паттерны для извлечения города
CITY_PATTERNS = [
    r"(?:г\.|город|г)\s*([А-Яа-яЁё\-\s]+?)(?:,|$)",
    r"(Санкт-Петербург|СПб|Москва|Мск)",
    r"Лен(?:\.|енинградская)?\s*обл(?:\.|асть)?\s*(?:,?\s*(?:гп?\.?|пос\.?|пгт\.?|г\.?))?\s*([А-Яа-яЁё\-\s]+?)(?:,|$)",
]

# Паттерны для извлечения улицы
STREET_PATTERNS = [
    # Проспект
    r"([А-Яа-яЁё\-\s]+?)\s*(?:пр\.|просп\.|проспект)",
    r"(?:пр\.|просп\.|проспект)\s*([А-Яа-яЁё\-\s]+?)(?:,|д\.|дом|\d)",
    # Улица
    r"([А-Яа-яЁё\-\s]+?)\s*(?:ул\.|улица)",
    r"(?:ул\.|улица)\s*([А-Яа-яЁё\-\s]+?)(?:,|д\.|дом|\d)",
    # Переулок
    r"([А-Яа-яЁё\-\s]+?)\s*(?:пер\.|переулок)",
    r"(?:пер\.|переулок)\s*([А-Яа-яЁё\-\s]+?)(?:,|д\.|дом|\d)",
    # Шоссе
    r"([А-Яа-яЁё\-\s]+?)\s*(?:ш\.|шоссе)",
    r"(?:ш\.|шоссе)\s*([А-Яа-яЁё\-\s]+?)(?:,|д\.|дом|\d)",
    # Бульвар
    r"([А-Яа-яЁё\-\s]+?)\s*(?:б-р\.|бульвар|бул\.)",
    r"(?:б-р\.|бульвар|бул\.)\s*([А-Яа-яЁё\-\s]+?)(?:,|д\.|дом|\d)",
    # Набережная
    r"([А-Яа-яЁё\-\s]+?)\s*(?:наб\.|набережная)",
    r"(?:наб\.|набережная)\s*([А-Яа-яЁё\-\s]+?)(?:,|д\.|дом|\d)",
    # Площадь
    r"([А-Яа-яЁё\-\s]+?)\s*(?:пл\.|площадь)",
    r"(?:пл\.|площадь)\s*([А-Яа-яЁё\-\s]+?)(?:,|д\.|дом|\d)",
]

# Паттерны для извлечения дома/корпуса
BUILDING_PATTERNS = [
    # Дом с корпусом: "д. 82, корп. 3" или "д.82к3"
    r"(?:д\.|дом)\s*(\d+)\s*,?\s*(?:корп\.|корпус|к\.?)\s*(\d+)",
    # Просто дом: "д. 82" или "дом 82"
    r"(?:д\.|дом)\s*(\d+[А-Яа-яA-Za-z]?)",
    # Дом со строением: "д. 82, стр. 1"
    r"(?:д\.|дом)\s*(\d+)\s*,?\s*(?:стр\.|строение)\s*(\d+)",
    # Литера: "д. 82А" или "д. 82 лит. А"
    r"(?:д\.|дом)\s*(\d+)\s*(?:лит\.|литера)?\s*([А-Яа-яA-Za-z])",
]


def parse_address(full_address: str) -> ParsedAddress:
    """
    Парсит полный адрес и извлекает город, улицу и номер дома.
    
    Args:
        full_address: Полный адрес в свободной форме
        
    Returns:
        ParsedAddress с извлечёнными компонентами
    """
    if not full_address:
        return ParsedAddress()
    
    result = ParsedAddress()
    text = full_address.strip()
    
    # 1. Извлекаем город
    for pattern in CITY_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            city = match.group(1) if match.lastindex else match.group(0)
            city = city.strip(" ,.")
            # Нормализуем
            city_lower = city.lower()
            if city_lower in CITY_ALIASES:
                result.city = CITY_ALIASES[city_lower]
            else:
                result.city = city.title()
            break
    
    # Проверяем сокращения в конце: ", СПб" или ", Мск"
    if not result.city:
        suffix_match = re.search(r",?\s*(СПб|Мск|Санкт-Петербург|Москва)\s*$", text, re.IGNORECASE)
        if suffix_match:
            city = suffix_match.group(1).strip()
            city_lower = city.lower()
            if city_lower in CITY_ALIASES:
                result.city = CITY_ALIASES[city_lower]
            else:
                result.city = city.title()
    
    # 2. Извлекаем улицу
    for pattern in STREET_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            street = match.group(1).strip(" ,.")
            # Удаляем город из улицы если попал
            if result.city and result.city.lower() in street.lower():
                continue
            # Определяем тип улицы
            if re.search(r"пр\.|просп\.|проспект", text, re.IGNORECASE):
                result.street = f"{street} пр."
            elif re.search(r"пер\.|переулок", text, re.IGNORECASE):
                result.street = f"{street} пер."
            elif re.search(r"ш\.|шоссе", text, re.IGNORECASE):
                result.street = f"{street} ш."
            elif re.search(r"б-р\.|бульвар|бул\.", text, re.IGNORECASE):
                result.street = f"{street} б-р"
            elif re.search(r"наб\.|набережная", text, re.IGNORECASE):
                result.street = f"{street} наб."
            elif re.search(r"пл\.|площадь", text, re.IGNORECASE):
                result.street = f"{street} пл."
            else:
                result.street = f"{street} ул."
            break
    
    # 3. Извлекаем дом/корпус
    for pattern in BUILDING_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            if match.lastindex and match.lastindex >= 2:
                # Дом + корпус/строение/литера
                house = match.group(1)
                suffix = match.group(2)
                result.building = house
                # Определяем тип корпуса
                if re.search(r"корп\.|корпус|к\.?", pattern, re.IGNORECASE):
                    result.corpus = suffix
                elif re.search(r"стр\.|строение", pattern, re.IGNORECASE):
                    result.corpus = f"стр.{suffix}"
                else:
                    # Литера - добавляем к номеру дома
                    result.building = f"{house}{suffix}"
            else:
                result.building = match.group(1)
            break
    
    # 4. Извлекаем подъезд
    entrance_patterns = [
        r"(?:подъезд|под\.|п\.)\s*(\d+)",
        r"(?:парадная|парад\.)\s*(\d+)",
    ]
    for pattern in entrance_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result.entrance = match.group(1)
            break
    
    return result


def compose_address(city: str = "", street: str = "", building: str = "", corpus: str = "", entrance: str = "") -> str:
    """
    Собирает полный адрес из компонентов.
    
    Args:
        city: Город
        street: Улица
        building: Номер дома
        corpus: Корпус/строение
        
    Returns:
        Полный адрес в формате "Улица, д. X, к. Y, Город"
    """
    parts = []
    
    if street:
        parts.append(street.strip())
    
    if building:
        building_str = building.strip()
        # Добавляем "д." если нет
        if not re.match(r"^(?:д\.|дом)", building_str, re.IGNORECASE):
            parts.append(f"д. {building_str}")
        else:
            parts.append(building_str)
    
    if corpus:
        corpus_str = corpus.strip()
        # Добавляем "к." если нет
        if not re.match(r"^(?:к\.|корп|стр)", corpus_str, re.IGNORECASE):
            parts.append(f"к. {corpus_str}")
        else:
            parts.append(corpus_str)
    
    if entrance:
        entrance_str = entrance.strip()
        # Добавляем "подъезд" если нет
        if not re.match(r"^(?:подъезд|под\.|п\.|парадная|парад\.)", entrance_str, re.IGNORECASE):
            parts.append(f"подъезд {entrance_str}")
        else:
            parts.append(entrance_str)
    
    if city:
        city = city.strip()
        # Сокращаем Санкт-Петербург до СПб
        if city.lower() in ["санкт-петербург", "питер", "петербург"]:
            parts.append("СПб")
        elif city.lower() in ["москва"]:
            parts.append("Москва")
        else:
            parts.append(city)
    
    return ", ".join(parts) if parts else ""


# Пример использования
if __name__ == "__main__":
    test_addresses = [
        "Ленинский пр. , д. 82, корп. 3, СПб",
        "г. Санкт-Петербург, ул. Невский проспект, д. 1",
        "Центральная ул., д.3, корп. 1, Лен. обл. гп. Новоселье",
        "пр. Просвещения, д. 14, к. 2, СПб",
        "Московский проспект 200А, Санкт-Петербург",
    ]
    
    for addr in test_addresses:
        parsed = parse_address(addr)
        print(f"\nВход: {addr}")
        print(f"Город: {parsed.city}")
        print(f"Улица: {parsed.street}")
        print(f"Дом: {parsed.building}")
        print(f"Корпус: {parsed.corpus}")
        print(f"Подъезд: {parsed.entrance}")
        
        composed = compose_address(parsed.city or "", parsed.street or "", parsed.building or "", parsed.corpus or "", parsed.entrance or "")
        print(f"Собранный: {composed}")
