"""
Tests for System Settings
=========================
Тесты системных настроек и прав ролей.
"""

import pytest
from sqlalchemy.orm import Session

from app.models.settings import (
    SystemSettingModel,
    RolePermissionModel,
    get_setting,
    set_setting,
    get_settings_by_group,
    get_all_settings,
)


class TestSystemSettingModel:
    """Тесты модели SystemSettingModel."""
    
    def test_create_setting(self, db_session: Session):
        """Создание настройки."""
        setting = SystemSettingModel(
            key="test_setting",
            value="test_value",
            value_type="string",
            group="test",
            label="Test Setting"
        )
        db_session.add(setting)
        db_session.commit()
        db_session.refresh(setting)
        
        assert setting.id is not None
        assert setting.key == "test_setting"
        assert setting.value == "test_value"
    
    def test_get_typed_value_string(self, db_session: Session):
        """Получение строкового значения."""
        setting = SystemSettingModel(
            key="string_setting",
            value="hello",
            value_type="string",
            label="String"
        )
        db_session.add(setting)
        db_session.commit()
        
        assert setting.get_typed_value() == "hello"
    
    def test_get_typed_value_bool_true(self, db_session: Session):
        """Получение bool значения (true)."""
        setting = SystemSettingModel(
            key="bool_setting",
            value="true",
            value_type="bool",
            label="Bool"
        )
        db_session.add(setting)
        db_session.commit()
        
        assert setting.get_typed_value() == True
    
    def test_get_typed_value_bool_false(self, db_session: Session):
        """Получение bool значения (false)."""
        setting = SystemSettingModel(
            key="bool_false",
            value="false",
            value_type="bool",
            label="Bool False"
        )
        db_session.add(setting)
        db_session.commit()
        
        assert setting.get_typed_value() == False
    
    def test_get_typed_value_int(self, db_session: Session):
        """Получение int значения."""
        setting = SystemSettingModel(
            key="int_setting",
            value="42",
            value_type="int",
            label="Int"
        )
        db_session.add(setting)
        db_session.commit()
        
        assert setting.get_typed_value() == 42
    
    def test_get_typed_value_float(self, db_session: Session):
        """Получение float значения."""
        setting = SystemSettingModel(
            key="float_setting",
            value="3.14",
            value_type="float",
            label="Float"
        )
        db_session.add(setting)
        db_session.commit()
        
        assert setting.get_typed_value() == 3.14
    
    def test_get_typed_value_json(self, db_session: Session):
        """Получение JSON значения."""
        setting = SystemSettingModel(
            key="json_setting",
            value='{"key": "value", "number": 123}',
            value_type="json",
            label="JSON"
        )
        db_session.add(setting)
        db_session.commit()
        
        result = setting.get_typed_value()
        assert result == {"key": "value", "number": 123}
    
    def test_get_typed_value_none(self, db_session: Session):
        """Получение None значения."""
        setting = SystemSettingModel(
            key="none_setting",
            value=None,
            value_type="string",
            label="None"
        )
        db_session.add(setting)
        db_session.commit()
        
        assert setting.get_typed_value() is None
    
    def test_set_typed_value_bool(self, db_session: Session):
        """Установка bool значения."""
        setting = SystemSettingModel(
            key="set_bool",
            value_type="bool",
            label="Set Bool"
        )
        setting.set_typed_value(True)
        db_session.add(setting)
        db_session.commit()
        
        assert setting.value == "true"
    
    def test_set_typed_value_json(self, db_session: Session):
        """Установка JSON значения."""
        setting = SystemSettingModel(
            key="set_json",
            value_type="json",
            label="Set JSON"
        )
        setting.set_typed_value({"foo": "bar"})
        db_session.add(setting)
        db_session.commit()
        
        assert '"foo"' in setting.value
        assert '"bar"' in setting.value


class TestSettingFunctions:
    """Тесты функций работы с настройками."""
    
    def test_get_setting_exists(self, db_session: Session):
        """Получение существующей настройки."""
        setting = SystemSettingModel(
            key="existing_key",
            value="existing_value",
            value_type="string",
            label="Existing"
        )
        db_session.add(setting)
        db_session.commit()
        
        result = get_setting(db_session, "existing_key")
        assert result == "existing_value"
    
    def test_get_setting_not_exists_default(self, db_session: Session):
        """Получение несуществующей настройки с default."""
        result = get_setting(db_session, "nonexistent_key", default="default_value")
        assert result == "default_value"
    
    def test_get_setting_not_exists_none(self, db_session: Session):
        """Получение несуществующей настройки без default."""
        result = get_setting(db_session, "nonexistent_key_2")
        assert result is None
    
    def test_set_setting_existing(self, db_session: Session):
        """Обновление существующей настройки."""
        setting = SystemSettingModel(
            key="to_update",
            value="old_value",
            value_type="string",
            label="To Update"
        )
        db_session.add(setting)
        db_session.commit()
        
        result = set_setting(db_session, "to_update", "new_value", updated_by="test")
        
        assert result is not None
        assert result.value == "new_value"
        assert result.updated_by == "test"
    
    def test_set_setting_nonexistent(self, db_session: Session):
        """Попытка обновить несуществующую настройку."""
        result = set_setting(db_session, "does_not_exist", "value")
        assert result is None
    
    def test_get_settings_by_group(self, db_session: Session):
        """Получение настроек по группе."""
        for i in range(3):
            setting = SystemSettingModel(
                key=f"group_test_{i}",
                value=str(i),
                value_type="int",
                group="test_group",
                label=f"Test {i}",
                sort_order=i
            )
            db_session.add(setting)
        
        # Другая группа
        other = SystemSettingModel(
            key="other_group_setting",
            value="x",
            group="other_group",
            label="Other"
        )
        db_session.add(other)
        db_session.commit()
        
        result = get_settings_by_group(db_session, "test_group")
        
        assert len(result) == 3
        # Проверяем сортировку
        assert result[0].key == "group_test_0"
    
    def test_get_settings_by_group_excludes_hidden(self, db_session: Session):
        """Скрытые настройки не включаются."""
        visible = SystemSettingModel(
            key="visible",
            value="v",
            group="mixed",
            label="Visible",
            is_hidden=False
        )
        hidden = SystemSettingModel(
            key="hidden",
            value="h",
            group="mixed",
            label="Hidden",
            is_hidden=True
        )
        db_session.add(visible)
        db_session.add(hidden)
        db_session.commit()
        
        result = get_settings_by_group(db_session, "mixed")
        
        assert len(result) == 1
        assert result[0].key == "visible"
    
    def test_get_all_settings(self, db_session: Session):
        """Получение всех настроек."""
        for i in range(5):
            setting = SystemSettingModel(
                key=f"all_test_{i}",
                value=str(i),
                group="all",
                label=f"All {i}"
            )
            db_session.add(setting)
        db_session.commit()
        
        result = get_all_settings(db_session)
        
        assert len(result) >= 5
    
    def test_get_all_settings_include_hidden(self, db_session: Session):
        """Получение всех настроек включая скрытые."""
        visible = SystemSettingModel(
            key="vis_all",
            value="v",
            group="all_hidden_test",
            label="Visible",
            is_hidden=False
        )
        hidden = SystemSettingModel(
            key="hid_all",
            value="h",
            group="all_hidden_test",
            label="Hidden",
            is_hidden=True
        )
        db_session.add(visible)
        db_session.add(hidden)
        db_session.commit()
        
        result_with_hidden = get_all_settings(db_session, include_hidden=True)
        result_without_hidden = get_all_settings(db_session, include_hidden=False)
        
        hidden_keys = [s.key for s in result_with_hidden]
        assert "hid_all" in hidden_keys
        
        visible_keys = [s.key for s in result_without_hidden]
        assert "hid_all" not in visible_keys


class TestRolePermissionModel:
    """Тесты модели прав ролей."""
    
    def test_create_permission(self, db_session: Session):
        """Создание разрешения."""
        permission = RolePermissionModel(
            role="admin",
            permission="view_dashboard",
            is_allowed=True
        )
        db_session.add(permission)
        db_session.commit()
        db_session.refresh(permission)
        
        assert permission.id is not None
        assert permission.role == "admin"
        assert permission.permission == "view_dashboard"
        assert permission.is_allowed == True
    
    def test_permission_denied(self, db_session: Session):
        """Создание запрещённого разрешения."""
        permission = RolePermissionModel(
            role="worker",
            permission="delete_tasks",
            is_allowed=False
        )
        db_session.add(permission)
        db_session.commit()
        
        assert permission.is_allowed == False
    
    def test_query_permissions_by_role(self, db_session: Session):
        """Запрос разрешений по роли."""
        permissions = [
            RolePermissionModel(role="dispatcher", permission="view_tasks", is_allowed=True),
            RolePermissionModel(role="dispatcher", permission="edit_tasks", is_allowed=True),
            RolePermissionModel(role="dispatcher", permission="delete_tasks", is_allowed=False),
            RolePermissionModel(role="admin", permission="all", is_allowed=True),
        ]
        for p in permissions:
            db_session.add(p)
        db_session.commit()
        
        dispatcher_perms = db_session.query(RolePermissionModel).filter(
            RolePermissionModel.role == "dispatcher"
        ).all()
        
        assert len(dispatcher_perms) == 3
        
        allowed = [p for p in dispatcher_perms if p.is_allowed]
        assert len(allowed) == 2


class TestSettingInvalidTypes:
    """Тесты обработки некорректных значений."""
    
    def test_invalid_int_returns_zero(self, db_session: Session):
        """Некорректный int возвращает 0."""
        setting = SystemSettingModel(
            key="bad_int",
            value="not a number",
            value_type="int",
            label="Bad Int"
        )
        db_session.add(setting)
        db_session.commit()
        
        assert setting.get_typed_value() == 0
    
    def test_invalid_float_returns_zero(self, db_session: Session):
        """Некорректный float возвращает 0.0."""
        setting = SystemSettingModel(
            key="bad_float",
            value="not a float",
            value_type="float",
            label="Bad Float"
        )
        db_session.add(setting)
        db_session.commit()
        
        assert setting.get_typed_value() == 0.0
    
    def test_invalid_json_returns_empty_dict(self, db_session: Session):
        """Некорректный JSON возвращает {}."""
        setting = SystemSettingModel(
            key="bad_json",
            value="not valid json {",
            value_type="json",
            label="Bad JSON"
        )
        db_session.add(setting)
        db_session.commit()
        
        assert setting.get_typed_value() == {}
