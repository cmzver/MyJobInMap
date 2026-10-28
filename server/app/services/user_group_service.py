"""
User Group Service
==================
Бизнес-логика реестра групп пользователей (кастомных ролей).

Группа — это запись в ``user_groups``; её ``name`` пишется в ``users.role`` и
служит ключом в ``role_permissions``. Встроенные группы (``is_system=True``)
нельзя удалять. ``base_access`` (admin/dispatcher/worker) задаёт грубый уровень
доступа для навигации портала и coarse-проверок.

ОБЛАСТЬ ВИДИМОСТИ (per-org): встроенные группы admin/dispatcher/worker —
ГЛОБАЛЬНЫЕ (``organization_id IS NULL``), общие для всех организаций и
управляются суперадмином. Кастомные группы ПРИНАДЛЕЖАТ организации
(``organization_id`` = id организации); их видит и которыми управляет только
эта организация (орг-админ). Имя уникально в рамках организации, поэтому org A и
org B могут иметь одноимённые группы с независимыми правами.
"""

from __future__ import annotations

import logging
from typing import List, Optional, Set

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import RolePermissionModel, UserGroupModel, UserModel
from app.models.enums import UserRole
from app.schemas import UserGroupCreate, UserGroupUpdate
from app.services.role_utils import canonical_role_value, public_role_value

logger = logging.getLogger(__name__)

# Встроенные роли всегда валидны, даже если реестр групп ещё не засеян.
BUILTIN_ROLES = {role.value for role in UserRole}

# Уровни базового доступа (драйвят навигацию портала и coarse-проверки).
BASE_ACCESS_LEVELS = {"admin", "dispatcher", "worker"}
# Кастомным группам доступны только dispatcher/worker — уровень admin
# зарезервирован за встроенной ролью, чтобы исключить случайную эскалацию прав.
CUSTOM_BASE_ACCESS = {"dispatcher", "worker"}

# Встроенные группы (дублируют сид в init_default_settings — держать синхронно).
# Глобальные (organization_id=NULL): name, label, base_access, description, sort_order.
BUILTIN_GROUP_DEFS = [
    ("admin", "Администратор", "admin", "Полный доступ ко всем функциям", 1),
    ("dispatcher", "Диспетчер", "dispatcher", "Управление заявками и исполнителями", 2),
    ("worker", "Работник", "worker", "Исполнение назначенных заявок", 3),
]

# Полный набор кодов прав — новые группы создаются со всеми правами в deny.
PERMISSION_CODES = [
    "view_dashboard",
    "view_tasks",
    "create_tasks",
    "edit_tasks",
    "delete_tasks",
    "change_task_status",
    "assign_tasks",
    "view_photos",
    "add_photos",
    "delete_photos",
    "view_comments",
    "add_comments",
    "view_users",
    "edit_users",
    "view_finance",
    "view_devices",
    "view_settings",
    "edit_settings",
    "view_addresses",
    "edit_addresses",
]


class UserGroupServiceError(Exception):
    """Ошибка операций с группами пользователей."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _is_builtin_role(role: Optional[str]) -> bool:
    """Является ли роль встроенной (глобальной) — по канонической форме."""
    return canonical_role_value(role) in BASE_ACCESS_LEVELS


def _scope_for_role(
    role: Optional[str], organization_id: Optional[int]
) -> Optional[int]:
    """Скоуп поиска прав/группы: NULL для встроенных, иначе организация пользователя."""
    return None if _is_builtin_role(role) else organization_id


def ensure_builtin_groups(db: Session) -> None:
    """Досеять глобальные встроенные группы, если их нет в реестре."""
    existing = {
        row.name
        for row in db.query(UserGroupModel.name)
        .filter(UserGroupModel.organization_id.is_(None))
        .all()
    }
    missing = [d for d in BUILTIN_GROUP_DEFS if d[0] not in existing]
    if not missing:
        return
    for name, label, base_access, description, sort_order in missing:
        db.add(
            UserGroupModel(
                name=name,
                label=label,
                base_access=base_access,
                description=description,
                is_system=True,
                sort_order=sort_order,
                organization_id=None,
            )
        )
    db.commit()


def list_groups(db: Session, organization_id: Optional[int]) -> List[UserGroupModel]:
    """Группы, видимые организации: глобальные встроенные + кастомные этой org."""
    ensure_builtin_groups(db)
    query = db.query(UserGroupModel).filter(
        or_(
            UserGroupModel.organization_id.is_(None),
            UserGroupModel.organization_id == organization_id,
        )
    )
    return query.order_by(UserGroupModel.sort_order, UserGroupModel.name).all()


def get_group(
    db: Session, name: str, organization_id: Optional[int]
) -> Optional[UserGroupModel]:
    """Группа по (name, organization_id). organization_id=None → встроенная."""
    return (
        db.query(UserGroupModel)
        .filter(
            UserGroupModel.name == name,
            UserGroupModel.organization_id == organization_id,
        )
        .first()
    )


def _resolve_group_cached(
    db: Session, name: Optional[str], organization_id: Optional[int]
) -> Optional[UserGroupModel]:
    """get_group с кэшем в рамках сессии (ключ — (organization_id, name)).

    Устраняет N+1 при сериализации списков пользователей. Только для read-путей;
    mutation-пути используют get_group напрямую."""
    if not name:
        return None
    cache = db.info.setdefault("_user_group_cache", {})
    key = (organization_id, name)
    if key not in cache:
        cache[key] = get_group(db, name, organization_id)
    return cache[key]


def _invalidate_group_cache(db: Session) -> None:
    db.info.pop("_user_group_cache", None)


def group_name_set(db: Session, organization_id: Optional[int]) -> Set[str]:
    """Имена групп, доступных организации (встроенные + кастомные этой org)."""
    rows = (
        db.query(UserGroupModel.name)
        .filter(
            or_(
                UserGroupModel.organization_id.is_(None),
                UserGroupModel.organization_id == organization_id,
            )
        )
        .all()
    )
    return {row.name for row in rows}


def is_valid_role(
    db: Session, role: Optional[str], organization_id: Optional[int]
) -> bool:
    """Роль валидна, если встроенная или существует как кастомная в этой org."""
    if not role:
        return False
    if role in BUILTIN_ROLES:
        return True
    names = group_name_set(db, organization_id)
    return role in names or canonical_role_value(role) in names


def resolve_base_access(
    db: Session, role: Optional[str], organization_id: Optional[int] = None
) -> str:
    """Базовый уровень доступа для роли: из группы (в её скоупе), иначе по алиасам."""
    if role:
        scope = _scope_for_role(role, organization_id)
        group = _resolve_group_cached(db, role, scope)
        if not group:
            # Алиасы (manager/superadmin) → каноническая встроенная (NULL-скоуп).
            group = _resolve_group_cached(db, canonical_role_value(role), None)
        if group:
            return group.base_access
    canonical = canonical_role_value(role)
    if canonical == "admin":
        return "admin"
    if canonical == "dispatcher":
        return "dispatcher"
    return "worker"


# Лейблы встроенных ролей как fallback, когда реестр групп ещё не засеян.
_BUILTIN_LABELS = {
    "admin": "Администратор",
    "dispatcher": "Диспетчер",
    "worker": "Работник",
}


def resolve_role_label(
    db: Session, role: Optional[str], organization_id: Optional[int] = None
) -> str:
    """Человекочитаемое название роли (label группы) для отображения в UI."""
    if public_role_value(role, organization_id) == "superadmin":
        return "Супер-админ"
    if role:
        scope = _scope_for_role(role, organization_id)
        group = _resolve_group_cached(db, role, scope)
        if not group:
            group = _resolve_group_cached(db, canonical_role_value(role), None)
        if group:
            return group.label
    return _BUILTIN_LABELS.get(canonical_role_value(role), role or "")


def create_group(
    db: Session, data: UserGroupCreate, organization_id: Optional[int]
) -> UserGroupModel:
    if data.base_access not in CUSTOM_BASE_ACCESS:
        raise UserGroupServiceError("base_access должен быть dispatcher или worker")
    if data.name in BUILTIN_ROLES:
        raise UserGroupServiceError("Имя зарезервировано встроенной ролью")
    if organization_id is None:
        raise UserGroupServiceError(
            "Кастомные группы создаются в рамках организации", 400
        )
    if get_group(db, data.name, organization_id):
        raise UserGroupServiceError("Группа с таким именем уже существует")

    group = UserGroupModel(
        name=data.name,
        label=data.label,
        description=data.description,
        base_access=data.base_access,
        is_system=False,
        sort_order=data.sort_order,
        organization_id=organization_id,
    )
    db.add(group)

    # Засеваем права новой группы как deny (в скоупе организации).
    for permission in PERMISSION_CODES:
        db.add(
            RolePermissionModel(
                role=data.name,
                permission=permission,
                is_allowed=False,
                organization_id=organization_id,
            )
        )

    db.commit()
    db.refresh(group)
    _invalidate_group_cache(db)
    return group


def _rename_group(db: Session, group: UserGroupModel, new_name: str) -> None:
    """Сменить slug кастомной группы с миграцией ссылок В РАМКАХ её организации."""
    if group.is_system:
        raise UserGroupServiceError("Нельзя переименовать встроенную группу", 403)
    if new_name == group.name:
        return
    if new_name in BUILTIN_ROLES:
        raise UserGroupServiceError("Имя зарезервировано встроенной ролью")
    if get_group(db, new_name, group.organization_id):
        raise UserGroupServiceError("Группа с таким именем уже существует")

    db.query(UserModel).filter(
        UserModel.role == group.name,
        UserModel.organization_id == group.organization_id,
    ).update({UserModel.role: new_name}, synchronize_session=False)
    db.query(RolePermissionModel).filter(
        RolePermissionModel.role == group.name,
        RolePermissionModel.organization_id == group.organization_id,
    ).update({RolePermissionModel.role: new_name}, synchronize_session=False)
    group.name = new_name


def update_group(
    db: Session, name: str, data: UserGroupUpdate, organization_id: Optional[int]
) -> UserGroupModel:
    group = get_group(db, name, organization_id)
    if not group:
        raise UserGroupServiceError("Группа не найдена", 404)

    if data.name is not None:
        _rename_group(db, group, data.name)
    if data.label is not None:
        group.label = data.label
    if data.description is not None:
        group.description = data.description
    if data.sort_order is not None:
        group.sort_order = data.sort_order
    if data.base_access is not None:
        if data.base_access not in CUSTOM_BASE_ACCESS:
            raise UserGroupServiceError("base_access должен быть dispatcher или worker")
        if group.is_system:
            raise UserGroupServiceError(
                "Нельзя менять базовый доступ встроенной группы", 403
            )
        group.base_access = data.base_access

    db.commit()
    db.refresh(group)
    _invalidate_group_cache(db)
    return group


def delete_group(db: Session, name: str, organization_id: Optional[int]) -> None:
    group = get_group(db, name, organization_id)
    if not group:
        raise UserGroupServiceError("Группа не найдена", 404)
    if group.is_system:
        raise UserGroupServiceError("Нельзя удалить встроенную группу", 403)

    in_use = (
        db.query(UserModel)
        .filter(
            UserModel.role == name,
            UserModel.organization_id == group.organization_id,
        )
        .count()
    )
    if in_use:
        raise UserGroupServiceError(
            f"Группа используется ({in_use} польз.); сначала смените их роль", 400
        )

    db.query(RolePermissionModel).filter(
        RolePermissionModel.role == name,
        RolePermissionModel.organization_id == group.organization_id,
    ).delete(synchronize_session=False)
    db.delete(group)
    db.commit()
    _invalidate_group_cache(db)
