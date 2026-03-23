"""
Tenant Middleware
=================
Middleware и зависимости для multi-tenant изоляции данных.

При включённом multi-tenant режиме:
- Все запросы к данным фильтруются по organization_id текущего пользователя
- Суперадмин (organization_id=None) видит данные всех организаций
- Создание записей автоматически привязывает organization_id
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Query, Session

from app.config import settings
from app.models import TaskModel, UserModel, get_db
from app.models.address import AddressModel
from app.services.role_utils import is_superadmin_user

logger = logging.getLogger(__name__)


class TenantFilter:
    """
    Помощник для фильтрации запросов по организации.

    Использование:
        tenant = TenantFilter(user)
        query = tenant.apply(db.query(TaskModel))
    """

    def __init__(self, user):
        self.user = user
        if user is None:
            # Без аутентификации доступ к tenant-scoped данным должен быть запрещён.
            self.org_id = None
            self.is_superadmin = False
        else:
            self.org_id = user.organization_id
            self.is_superadmin = is_superadmin_user(user)

    def apply(self, query: Query, model=None) -> Query:
        """
        Применить фильтр по организации к запросу.

        Суперадмин (org_id=None + admin role) видит все данные.
        Остальные видят только данные своей организации.
        """
        if self.is_superadmin:
            return query

        # Определяем модель из запроса, если не передана явно
        if model is None:
            # Попробуем определить модель из query entity
            entities = getattr(query, "column_descriptions", None)
            if entities and len(entities) > 0:
                model = entities[0].get("entity")

        if model and hasattr(model, "organization_id"):
            return query.filter(model.organization_id == self.org_id)

        return query

    def set_org_id(self, obj) -> None:
        """
        Установить organization_id на объекте при создании.

        Если пользователь привязан к организации, привязывает запись.
        Суперадмин может создавать записи без организации.
        """
        if hasattr(obj, "organization_id") and self.org_id is not None:
            obj.organization_id = self.org_id

    def check_access(self, obj) -> bool:
        """
        Проверить, имеет ли пользователь доступ к объекту.

        Returns:
            True если доступ разрешён
        """
        if self.is_superadmin:
            return True

        obj_org_id = getattr(obj, "organization_id", None)

        # Legacy single-tenant режим: пользователь и объект без организации.
        if self.user is None:
            return False

        if self.org_id is None:
            return obj_org_id is None

        # Tenant-scoped пользователь не должен видеть unscoped записи.
        if obj_org_id is None:
            return False

        return obj_org_id == self.org_id

    def enforce_access(self, obj, detail: str = "Доступ запрещён") -> None:
        """Проверить доступ и выбросить исключение при отказе."""
        if not self.check_access(obj):
            raise HTTPException(status_code=403, detail=detail)
