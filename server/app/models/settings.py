"""
Settings Models
===============
Модели настроек системы, кастомных полей и прав доступа.

Этот модуль содержит все модели связанные с конфигурацией системы:
- SystemSettingModel: Системные настройки (группы: images, backup, notifications, security, interface, server)
- CustomFieldModel: Динамические поля для заявок
- CustomFieldValueModel: Значения кастомных полей
- RolePermissionModel: Разрешения для ролей
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, JSON
from sqlalchemy.orm import Session

from app.models.base import Base, utcnow


# ============================================
# System Settings
# ============================================

class SystemSettingModel(Base):
    """
    Модель системных настроек.
    
    Хранит все настраиваемые параметры сервера с поддержкой типизации и групп.
    Группы: images, backup, notifications, security, interface, server
    Типы: string, int, float, bool, json, select
    """
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Ключ настройки (уникальный)
    key = Column(String(100), unique=True, nullable=False, index=True)
    
    # Значение (строка, парсится по типу)
    value = Column(Text, nullable=True)
    
    # Тип значения: string, int, float, bool, json, select
    value_type = Column(String(20), default="string")
    
    # Группа настроек для UI
    group = Column(String(50), default="general")
    
    # Отображаемое название
    label = Column(String(100), nullable=False)
    
    # Описание настройки
    description = Column(String(500), nullable=True)
    
    # Опции для select типа (JSON массив)
    options = Column(JSON, nullable=True)
    
    # Порядок отображения
    sort_order = Column(Integer, default=0)
    
    # Скрытая настройка (не показывать в UI)
    is_hidden = Column(Boolean, default=False)
    
    # Только для чтения
    is_readonly = Column(Boolean, default=False)
    
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    updated_by = Column(String(100), nullable=True)

    def get_typed_value(self):
        """Получить значение с правильным типом"""
        if self.value is None:
            return None
        
        if self.value_type == "bool":
            return self.value.lower() in ("true", "1", "yes", "on")
        elif self.value_type == "int":
            try:
                return int(self.value)
            except ValueError:
                return 0
        elif self.value_type == "float":
            try:
                return float(self.value)
            except ValueError:
                return 0.0
        elif self.value_type == "json":
            import json
            try:
                return json.loads(self.value)
            except (json.JSONDecodeError, ValueError):
                return {}
        else:
            return self.value
    
    def set_typed_value(self, value):
        """Установить значение с конвертацией в строку"""
        if self.value_type == "bool":
            self.value = "true" if value else "false"
        elif self.value_type == "json":
            import json
            self.value = json.dumps(value, ensure_ascii=False)
        else:
            self.value = str(value) if value is not None else None


# ============================================
# Custom Fields
# ============================================

class CustomFieldModel(Base):
    """
    Модель кастомных полей заявок.
    
    Позволяет динамически добавлять новые поля к заявкам без изменения схемы БД.
    Поддерживаемые типы: text, number, select, date, checkbox, textarea
    """
    __tablename__ = "custom_fields"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Системное имя поля (латиница, без пробелов)
    name = Column(String(50), unique=True, nullable=False, index=True)
    
    # Отображаемое название
    label = Column(String(100), nullable=False)
    
    # Тип поля: text, number, select, date, checkbox, textarea
    field_type = Column(String(20), default="text")
    
    # Обязательное поле
    is_required = Column(Boolean, default=False)
    
    # Активно (показывать в формах)
    is_active = Column(Boolean, default=True)
    
    # Показывать в списке заявок
    show_in_list = Column(Boolean, default=False)
    
    # Показывать в карточке заявки
    show_in_card = Column(Boolean, default=True)
    
    # Опции для select типа (JSON массив строк)
    options = Column(JSON, nullable=True)
    
    # Значение по умолчанию
    default_value = Column(String(255), nullable=True)
    
    # Placeholder для текстовых полей
    placeholder = Column(String(255), nullable=True)
    
    # Порядок отображения
    sort_order = Column(Integer, default=0)
    
    # Группа полей (для организации в UI)
    field_group = Column(String(50), default="custom")
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class CustomFieldValueModel(Base):
    """
    Значения кастомных полей для конкретных заявок.
    """
    __tablename__ = "custom_field_values"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с заявкой
    task_id = Column(Integer, nullable=False, index=True)
    
    # Связь с полем
    field_id = Column(Integer, nullable=False, index=True)
    
    # Значение поля
    value = Column(Text, nullable=True)
    
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


# ============================================
# Role Permissions
# ============================================

class RolePermissionModel(Base):
    """
    Разрешения для ролей.
    
    Определяет какие функции доступны каждой роли (admin, dispatcher, worker).
    Разрешения: view_dashboard, view_tasks, create_tasks, edit_tasks, etc.
    """
    __tablename__ = "role_permissions"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Роль: admin, dispatcher, worker
    role = Column(String(20), nullable=False, index=True)
    
    # Код разрешения
    permission = Column(String(50), nullable=False)
    
    # Разрешено или запрещено
    is_allowed = Column(Boolean, default=True)


# ============================================
# Helper Functions
# ============================================

def get_setting(db: Session, key: str, default=None):
    """Получить значение настройки по ключу"""
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
    if setting:
        return setting.get_typed_value()
    return default


def set_setting(db: Session, key: str, value, updated_by: str = None):
    """Установить значение настройки"""
    setting = db.query(SystemSettingModel).filter(SystemSettingModel.key == key).first()
    if setting:
        setting.set_typed_value(value)
        setting.updated_by = updated_by
        db.commit()
        return setting
    return None


def get_settings_by_group(db: Session, group: str):
    """Получить все настройки группы"""
    return db.query(SystemSettingModel).filter(
        SystemSettingModel.group == group,
        SystemSettingModel.is_hidden == False
    ).order_by(SystemSettingModel.sort_order).all()


def get_all_settings(db: Session, include_hidden: bool = False):
    """Получить все настройки"""
    query = db.query(SystemSettingModel)
    if not include_hidden:
        query = query.filter(SystemSettingModel.is_hidden == False)
    return query.order_by(SystemSettingModel.group, SystemSettingModel.sort_order).all()


def init_default_settings(db: Session):
    """
    Инициализация настроек по умолчанию.
    
    Вызывается при первом запуске сервера.
    Создаёт все необходимые настройки и разрешения ролей.
    """
    
    default_settings = [
        # === Изображения ===
        {
            "key": "image_optimization_enabled",
            "value": "true",
            "value_type": "bool",
            "group": "images",
            "label": "Оптимизация изображений",
            "description": "Автоматическое сжатие и ресайз загружаемых фото",
            "sort_order": 1
        },
        {
            "key": "image_quality",
            "value": "85",
            "value_type": "int",
            "group": "images",
            "label": "Качество сжатия",
            "description": "Качество JPEG/WebP (1-100). Рекомендуется 80-90",
            "sort_order": 2
        },
        {
            "key": "image_max_dimension",
            "value": "1920",
            "value_type": "int",
            "group": "images",
            "label": "Максимальный размер (px)",
            "description": "Максимальная ширина или высота изображения",
            "sort_order": 3
        },
        {
            "key": "image_convert_to_webp",
            "value": "false",
            "value_type": "bool",
            "group": "images",
            "label": "Конвертировать в WebP",
            "description": "Конвертировать все изображения в формат WebP",
            "sort_order": 4
        },
        
        # === Резервное копирование ===
        {
            "key": "backup_auto_enabled",
            "value": "true",
            "value_type": "bool",
            "group": "backup",
            "label": "Автоматические бэкапы",
            "description": "Включить автоматическое резервное копирование",
            "sort_order": 1
        },
        {
            "key": "backup_schedule",
            "value": "daily",
            "value_type": "select",
            "group": "backup",
            "label": "Расписание бэкапов",
            "description": "Как часто создавать резервные копии",
            "options": [
                {"value": "daily", "label": "Ежедневно"},
                {"value": "weekly", "label": "Еженедельно"},
                {"value": "manual", "label": "Вручную"}
            ],
            "sort_order": 2
        },
        {
            "key": "backup_retention_days",
            "value": "30",
            "value_type": "int",
            "group": "backup",
            "label": "Хранить бэкапы (дней)",
            "description": "Количество дней хранения старых бэкапов",
            "sort_order": 3
        },
        {
            "key": "backup_include_photos",
            "value": "false",
            "value_type": "bool",
            "group": "backup",
            "label": "Включать фото в бэкап",
            "description": "Архивировать папку с фотографиями",
            "sort_order": 4
        },
        
        # === Уведомления ===
        {
            "key": "push_enabled",
            "value": "true",
            "value_type": "bool",
            "group": "notifications",
            "label": "Push-уведомления",
            "description": "Отправлять push-уведомления на устройства",
            "sort_order": 1
        },
        {
            "key": "notify_on_new_task",
            "value": "true",
            "value_type": "bool",
            "group": "notifications",
            "label": "Уведомлять о новых заявках",
            "description": "Отправлять уведомление при создании заявки",
            "sort_order": 2
        },
        {
            "key": "notify_on_status_change",
            "value": "true",
            "value_type": "bool",
            "group": "notifications",
            "label": "Уведомлять о смене статуса",
            "description": "Отправлять уведомление при изменении статуса",
            "sort_order": 3
        },
        
        # === Безопасность ===
        {
            "key": "rate_limit_attempts",
            "value": "5",
            "value_type": "int",
            "group": "security",
            "label": "Попыток входа",
            "description": "Максимум попыток входа до блокировки",
            "sort_order": 1
        },
        {
            "key": "rate_limit_window",
            "value": "60",
            "value_type": "int",
            "group": "security",
            "label": "Окно блокировки (сек)",
            "description": "Время сброса счётчика попыток",
            "sort_order": 2
        },
        {
            "key": "session_timeout_hours",
            "value": "168",
            "value_type": "int",
            "group": "security",
            "label": "Время сессии (часов)",
            "description": "Срок действия JWT токена (168 = 1 неделя)",
            "sort_order": 3
        },
        
        # === Интерфейс ===
        {
            "key": "tasks_per_page",
            "value": "50",
            "value_type": "int",
            "group": "interface",
            "label": "Заявок на странице",
            "description": "Количество заявок на одной странице",
            "sort_order": 1
        },
        {
            "key": "auto_refresh_interval",
            "value": "30",
            "value_type": "int",
            "group": "interface",
            "label": "Автообновление (сек)",
            "description": "Интервал автоматического обновления данных",
            "sort_order": 2
        },
        {
            "key": "default_task_priority",
            "value": "1",
            "value_type": "select",
            "group": "interface",
            "label": "Приоритет по умолчанию",
            "description": "Приоритет для новых заявок",
            "options": [
                {"value": "1", "label": "Плановая"},
                {"value": "2", "label": "Текущая"},
                {"value": "3", "label": "Срочная"},
                {"value": "4", "label": "Аварийная"}
            ],
            "sort_order": 3
        },
        
        # === Сервер (только чтение) ===
        {
            "key": "server_version",
            "value": "2.3.0",
            "value_type": "string",
            "group": "server",
            "label": "Версия сервера",
            "description": "Текущая версия API",
            "is_readonly": True,
            "sort_order": 1
        },
        {
            "key": "server_port",
            "value": "8001",
            "value_type": "int",
            "group": "server",
            "label": "Порт сервера",
            "description": "HTTP порт (требует перезапуска)",
            "is_readonly": True,
            "sort_order": 2
        },
        
        # === Типы неисправностей ===
        {
            "key": "defect_types",
            "value": '[{"id": "1", "name": "Не работает домофон", "system_types": ["intercom"], "description": "Неисправность домофонной системы"}, {"id": "2", "name": "Нет изображения с камеры", "system_types": ["video_surveillance"], "description": "Проблема с видеонаблюдением"}, {"id": "3", "name": "Не открывается замок", "system_types": ["intercom", "access_control"], "description": "Неисправность электромагнитного замка"}, {"id": "4", "name": "Нет связи с панелью", "system_types": ["intercom"], "description": "Проблема связи абонентской панели"}, {"id": "5", "name": "Сработала пожарная сигнализация", "system_types": ["fire_alarm", "fire_protection"], "description": "Срабатывание пожарных датчиков"}, {"id": "6", "name": "Замена трубки домофона", "system_types": ["intercom"], "description": "Замена абонентского устройства"}, {"id": "7", "name": "Плановое обслуживание", "system_types": [], "description": "Регламентные работы"}, {"id": "8", "name": "Настройка оборудования", "system_types": [], "description": "Настройка параметров системы"}, {"id": "9", "name": "Замена батареек в датчиках", "system_types": ["fire_alarm"], "description": "Замена элементов питания"}, {"id": "10", "name": "Механическое повреждение", "system_types": [], "description": "Вандализм или износ оборудования"}, {"id": "11", "name": "Проблемы с питанием", "system_types": [], "description": "Отсутствие или скачки напряжения"}, {"id": "12", "name": "Программная ошибка", "system_types": [], "description": "Сбой ПО оборудования"}, {"id": "13", "name": "Консультация", "system_types": [], "description": "Консультация по эксплуатации"}, {"id": "14", "name": "Добавление жильца", "system_types": ["intercom", "access_control"], "description": "Добавление нового абонента"}, {"id": "15", "name": "Удаление жильца", "system_types": ["intercom", "access_control"], "description": "Удаление абонента из системы"}, {"id": "16", "name": "Нет записи на регистраторе", "system_types": ["video_surveillance"], "description": "Проблема записи видео"}, {"id": "17", "name": "Размытое изображение", "system_types": ["video_surveillance"], "description": "Камера не в фокусе или грязная"}, {"id": "18", "name": "Не работает ИК-подсветка", "system_types": ["video_surveillance"], "description": "Нет ночного видения"}, {"id": "19", "name": "Ложные срабатывания", "system_types": ["fire_alarm", "fire_protection"], "description": "Сигнализация срабатывает без причины"}, {"id": "20", "name": "Проблема с СКД картой/ключом", "system_types": ["access_control"], "description": "Не читается ключ или карта"}]',
            "value_type": "json",
            "group": "interface",
            "label": "Типы неисправностей",
            "description": "Список типов неисправностей для заявок",
            "sort_order": 4
        },
    ]
    
    # Разрешения по умолчанию
    default_permissions = [
        # Admin - всё разрешено
        ("admin", "view_dashboard", True),
        ("admin", "view_tasks", True),
        ("admin", "create_tasks", True),
        ("admin", "edit_tasks", True),
        ("admin", "delete_tasks", True),
        ("admin", "change_task_status", True),
        ("admin", "assign_tasks", True),
        ("admin", "view_photos", True),
        ("admin", "add_photos", True),
        ("admin", "delete_photos", True),
        ("admin", "view_comments", True),
        ("admin", "add_comments", True),
        ("admin", "view_users", True),
        ("admin", "edit_users", True),
        ("admin", "view_finance", True),
        ("admin", "view_devices", True),
        ("admin", "view_settings", True),
        ("admin", "edit_settings", True),
        ("admin", "view_addresses", True),
        ("admin", "edit_addresses", True),
        
        # Dispatcher - ограниченный доступ
        ("dispatcher", "view_dashboard", True),
        ("dispatcher", "view_tasks", True),
        ("dispatcher", "create_tasks", True),
        ("dispatcher", "edit_tasks", True),
        ("dispatcher", "delete_tasks", False),
        ("dispatcher", "change_task_status", True),
        ("dispatcher", "assign_tasks", True),
        ("dispatcher", "view_photos", True),
        ("dispatcher", "add_photos", True),
        ("dispatcher", "delete_photos", False),
        ("dispatcher", "view_comments", True),
        ("dispatcher", "add_comments", True),
        ("dispatcher", "view_users", True),
        ("dispatcher", "edit_users", False),
        ("dispatcher", "view_finance", True),
        ("dispatcher", "view_devices", False),
        ("dispatcher", "view_settings", False),
        ("dispatcher", "edit_settings", False),
        ("dispatcher", "view_addresses", True),
        ("dispatcher", "edit_addresses", True),
        
        # Worker - минимальный доступ
        ("worker", "view_dashboard", False),
        ("worker", "view_tasks", True),
        ("worker", "create_tasks", False),
        ("worker", "edit_tasks", True),  # только свои
        ("worker", "delete_tasks", False),
        ("worker", "change_task_status", True),  # только свои
        ("worker", "assign_tasks", False),
        ("worker", "view_photos", True),
        ("worker", "add_photos", True),
        ("worker", "delete_photos", False),
        ("worker", "view_comments", True),
        ("worker", "add_comments", True),
        ("worker", "view_users", False),
        ("worker", "edit_users", False),
        ("worker", "view_finance", False),
        ("worker", "view_devices", False),
        ("worker", "view_settings", False),
        ("worker", "edit_settings", False),
        ("worker", "view_addresses", True),
        ("worker", "edit_addresses", False),
    ]
    
    # Создаём настройки если не существуют
    for setting_data in default_settings:
        existing = db.query(SystemSettingModel).filter(
            SystemSettingModel.key == setting_data["key"]
        ).first()
        
        if not existing:
            setting = SystemSettingModel(**setting_data)
            db.add(setting)
    
    # Создаём разрешения если не существуют
    for role, permission, is_allowed in default_permissions:
        existing = db.query(RolePermissionModel).filter(
            RolePermissionModel.role == role,
            RolePermissionModel.permission == permission
        ).first()
        
        if not existing:
            perm = RolePermissionModel(
                role=role,
                permission=permission,
                is_allowed=is_allowed
            )
            db.add(perm)
    
    db.commit()
    print("✅ Default settings and permissions initialized")
