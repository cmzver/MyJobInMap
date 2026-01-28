"""
Task Parser Service
===================
Парсинг заявок из текстовых сообщений диспетчерской программы.

Поддерживаемые форматы:
1. Диспетчерский: №1173544 Текущая. Адрес, подъезд 1. Категория. Описание. кв.45 +79110000000
2. Стандартный: Адрес\nОписание
"""

import re
from dataclasses import dataclass
from app.models.enums import TaskPriority
from typing import Optional


@dataclass
class ParsedTask:
    """Распарсенная заявка из сообщения."""
    title: str
    address: str
    description: str
    external_id: Optional[str] = None  # Номер заявки из внешней системы
    contact_phone: Optional[str] = None  # Телефон контакта
    contact_name: Optional[str] = None  # Имя контакта
    apartment: Optional[str] = None  # Номер квартиры
    priority: str = TaskPriority.CURRENT.value  # 1=Плановая, 2=Текущая, 3=Срочная, 4=Аварийная

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "address": self.address,
            "description": self.description,
            "external_id": self.external_id,
            "contact_phone": self.contact_phone,
            "contact_name": self.contact_name,
            "apartment": self.apartment,
            "priority": self.priority,
        }


def parse_dispatcher_format(text: str) -> Optional[ParsedTask]:
    """
    Парсит заявку в формате диспетчерской:
    №1173544 Текущая. Центральная ул., д.3, корп. 1, Лен. обл. гп. Новоселье, подъезд 1.
    Брелки, ключи, карты.Не работает брелок на парковку .кв.45 +79110267493
    
    Структура:
    - №XXXXXX — номер заявки
    - Текущая/Срочная/Плановая/Аварийная — приоритет
    - Адрес до первой точки после "подъезд X"
    - Категория работ (Брелки, Трубка, Кнопка и т.д.)
    - Описание проблемы
    - кв.XX — квартира
    - +7XXXXXXXXXX — телефон
    """
    # Проверяем, что это заявка диспетчерской (начинается с №)
    if not text.strip().startswith("№"):
        return None
    
    # Извлекаем номер заявки
    external_id_match = re.search(r"№(\d+)", text)
    external_id = external_id_match.group(1) if external_id_match else None
    
    # Определяем приоритет
    priority = TaskPriority.CURRENT.value  # По умолчанию - Текущая
    if re.search(r"Аварийная", text, re.IGNORECASE):
        priority = TaskPriority.EMERGENCY.value
    elif re.search(r"Срочная", text, re.IGNORECASE):
        priority = TaskPriority.URGENT.value
    elif re.search(r"Плановая", text, re.IGNORECASE):
        priority = TaskPriority.PLANNED.value
    
    # Извлекаем телефон (формат +7XXXXXXXXXX или 7XXXXXXXXXX или 8XXXXXXXXXX)
    phone_match = re.search(r"(\+7\d{10}|[78]\d{10})", text)
    contact_phone = phone_match.group(0) if phone_match else None
    
    # Извлекаем квартиру
    apt_match = re.search(r"кв\.?\s*(\d+)", text, re.IGNORECASE)
    apartment = apt_match.group(1) if apt_match else None
    
    # Извлекаем адрес: от "Текущая/Срочная/Плановая/Аварийная." до "подъезд X" включительно
    address_match = re.search(
        r"(?:Текущая|Срочная|Плановая|Аварийная)[\.\s]+(.+?подъезд\s*\d+(?:\s*\([^)]+\))?)",
        text,
        re.IGNORECASE
    )
    
    if address_match:
        address = address_match.group(1).strip()
        address = address.rstrip(".")
    else:
        # Альтернативный вариант - адрес до первой категории работ
        alt_match = re.search(
            r"(?:Текущая|Срочная|Плановая|Аварийная)[\.\s]+(.+?(?:,\s*(?:СПб|Санкт-Петербург|Лен\.?\s*обл)[^.]*?))",
            text,
            re.IGNORECASE
        )
        if alt_match:
            address = alt_match.group(1).strip().rstrip(".")
        else:
            # Пробуем взять текст после номера и приоритета до первой точки
            simple_match = re.search(
                r"(?:Текущая|Срочная|Плановая|Аварийная)[\.\s]+([^.]+)",
                text,
                re.IGNORECASE
            )
            address = simple_match.group(1).strip() if simple_match else "Не распознан"
    
    # Находим текст после адреса для извлечения категории и описания
    after_address = text
    if address_match:
        after_address = text[address_match.end():]
    
    # Убираем начальные точки и пробелы
    after_address = re.sub(r"^[\.\s]+", "", after_address)
    
    # Разбиваем на части по точкам
    parts = [p.strip() for p in re.split(r"\.\s*", after_address) if p.strip()]
    
    # Первая часть обычно категория работ
    category = parts[0] if parts else ""
    
    # Остальное — описание (убираем телефон и квартиру)
    description_parts = parts[1:] if len(parts) > 1 else []
    description = ". ".join(description_parts)
    
    # Убираем телефон и квартиру из описания
    description = re.sub(r"\+?[78]?\d{10,11}", "", description)
    description = re.sub(r"кв\.?\s*\d+", "", description, flags=re.IGNORECASE)
    description = re.sub(r"\s+", " ", description).strip(" .,")
    
    # Извлекаем имя контакта (обычно в конце, может быть с должностью)
    contact_name = None
    # Ищем два или три слова с заглавной буквы подряд
    name_match = re.search(r"([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)\s*$", text)
    if name_match:
        potential_name = name_match.group(1)
        # Исключаем известные не-имена
        if not re.match(r"(Лен\s+обл|Санкт\s+Петербург)", potential_name, re.IGNORECASE):
            contact_name = potential_name
    
    # Формируем title из категории
    if category:
        title = f"[{external_id}] {category}" if external_id else category
    else:
        title = f"Заявка №{external_id}" if external_id else "Новая заявка"
    
    # Если квартира есть, добавляем к адресу
    if apartment and address != "Не распознан":
        address = f"{address}, кв. {apartment}"
    
    # Формируем полное описание
    full_description = description if description else category
    if contact_name:
        full_description += f" | Контакт: {contact_name}"
    if contact_phone:
        full_description += f" | Тел: {contact_phone}"
    
    return ParsedTask(
        title=title,
        address=address,
        description=full_description,
        external_id=external_id,
        contact_phone=contact_phone,
        contact_name=contact_name,
        apartment=apartment,
        priority=priority
    )


def parse_standard_format(text: str) -> Optional[ParsedTask]:
    """
    Парсит заявку в стандартном формате:
    Адрес
    Описание проблемы
    """
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]
    
    if not lines:
        return None
    
    # Если одна строка - это и адрес и описание
    if len(lines) == 1:
        return ParsedTask(
            title="Новая заявка",
            address=lines[0],
            description=lines[0]
        )
    
    # Первая строка - адрес, остальное - описание
    address = lines[0]
    description = " ".join(lines[1:])
    
    # Извлекаем телефон если есть
    phone_match = re.search(r"(\+7\d{10}|[78]\d{10})", text)
    contact_phone = phone_match.group(0) if phone_match else None
    
    return ParsedTask(
        title="Новая заявка",
        address=address,
        description=description,
        contact_phone=contact_phone
    )


def parse_task_message(text: str) -> Optional[ParsedTask]:
    """
    Универсальный парсер заявок.
    
    Пробует распознать формат сообщения и извлечь данные заявки.
    
    Поддерживаемые форматы:
    1. Формат диспетчерской: №1173544 Текущая. Адрес...
    2. Стандартный формат: Адрес\\nОписание
    
    Args:
        text: Текст сообщения
    
    Returns:
        ParsedTask или None, если сообщение не является заявкой.
    """
    if not text or len(text.strip()) < 10:
        return None
    
    text = text.strip()
    
    # Пробуем формат диспетчерской
    if text.startswith("№"):
        result = parse_dispatcher_format(text)
        if result:
            return result
    
    # Пробуем стандартный формат
    return parse_standard_format(text)


# Синглтон-функция для использования в API
def parse_dispatcher_message(text: str) -> dict:
    """
    Парсит сообщение диспетчерской и возвращает dict для создания заявки.
    
    Returns:
        dict с полями: success, data (если success=True), error (если success=False)
    """
    try:
        result = parse_task_message(text)
        if result:
            return {
                "success": True,
                "data": result.to_dict()
            }
        return {
            "success": False,
            "error": "Не удалось распознать формат сообщения"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
