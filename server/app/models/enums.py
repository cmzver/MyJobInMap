"""
Enums
=====
Перечисления для моделей.
"""

from enum import Enum


class TaskStatus(str, Enum):
    """Статусы заявки"""
    NEW = "NEW"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    CANCELLED = "CANCELLED"


class TaskPriority(str, Enum):
    """
    Приоритеты заявок.
    Соответствуют типам: Плановая, Текущая, Срочная, Аварийная.
    """
    PLANNED = "PLANNED"      # Плановая
    CURRENT = "CURRENT"      # Текущая
    URGENT = "URGENT"       # Срочная
    EMERGENCY = "EMERGENCY"    # Аварийная
    
    @classmethod
    def from_text(cls, text: str) -> 'TaskPriority':
        """Парсит приоритет из текста заявки"""
        text_lower = text.lower()
        if 'аварийн' in text_lower:
            return cls.EMERGENCY
        elif 'срочн' in text_lower:
            return cls.URGENT
        elif 'текущ' in text_lower:
            return cls.CURRENT
        else:
            return cls.PLANNED
    
    @property
    def display_name(self) -> str:
        """Русское название приоритета"""
        names = {
            TaskPriority.PLANNED: "Плановая",
            TaskPriority.CURRENT: "Текущая",
            TaskPriority.URGENT: "Срочная",
            TaskPriority.EMERGENCY: "Аварийная"
        }
        return names.get(self, "Плановая")


class UserRole(str, Enum):
    """Роли пользователей"""
    ADMIN = "admin"
    DISPATCHER = "dispatcher"
    WORKER = "worker"
