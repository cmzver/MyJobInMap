"""
User Service
============
Бизнес-логика управления пользователями (CRUD) с учётом мультитенантности,
ограничений ролей org-admin, лимита пользователей организации и аудита.

Роутеры (app/api/admin/users.py) — тонкие контроллеры поверх этого сервиса.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import Depends
from sqlalchemy.orm import Session

from app.models import TaskModel, UserModel, UserRole, get_db
from app.schemas import UserCreate, UserStatsResponse, UserUpdate
from app.services.audit_log import (
    audit_user_created,
    audit_user_deleted,
    audit_user_updated,
)
from app.services.auth import get_password_hash
from app.services.role_utils import canonical_role_value
from app.services.tenant_filter import TenantFilter
from app.services.user_group_service import is_valid_role

logger = logging.getLogger(__name__)


class UserServiceError(Exception):
    """Базовое исключение сервиса пользователей."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class UserService:
    """Управление пользователями с учётом прав актора и мультитенантности."""

    def __init__(self, db: Session):
        self.db = db

    def list_users(self, actor: UserModel) -> List[UserModel]:
        """Все пользователи в области видимости актора."""
        tenant = TenantFilter(actor)
        return tenant.apply(self.db.query(UserModel), UserModel).all()

    def list_workers(self, actor: UserModel) -> List[UserModel]:
        """Активные пользователи, доступные для назначения.

        Это все активные не-админы: встроенные worker/dispatcher и кастомные
        группы (их base_access ограничен dispatcher/worker, т.е. они назначаемы).
        """
        tenant = TenantFilter(actor)
        return (
            tenant.apply(self.db.query(UserModel), UserModel)
            .filter(
                UserModel.role != UserRole.ADMIN.value,
                UserModel.is_active == True,
            )
            .all()
        )

    def get_stats(self, actor: UserModel, user_id: int) -> UserStatsResponse:
        """Статистика пользователя по заявкам (счётчики, заработок, периоды)."""
        user = self.db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            raise UserServiceError("User not found", 404)

        tenant = TenantFilter(actor)
        tenant.enforce_access(user)

        all_tasks = (
            tenant.apply(self.db.query(TaskModel), TaskModel)
            .filter(TaskModel.assigned_user_id == user_id)
            .all()
        )

        total_tasks = len(all_tasks)
        completed_tasks = sum(1 for t in all_tasks if t.status == "DONE")
        in_progress_tasks = sum(1 for t in all_tasks if t.status == "IN_PROGRESS")
        new_tasks = sum(1 for t in all_tasks if t.status == "NEW")

        completed_paid_tasks = [
            t for t in all_tasks if t.status == "DONE" and t.is_paid
        ]
        total_earnings = sum(t.payment_amount or 0.0 for t in completed_paid_tasks)
        paid_tasks_count = len(completed_paid_tasks)
        remote_tasks_count = sum(1 for t in all_tasks if t.is_remote)

        now = datetime.now(timezone.utc)
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_of_week = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        def _as_utc(value):
            if not value:
                return None
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)

        completed_this_month = 0
        earnings_this_month = 0.0
        completed_this_week = 0
        earnings_this_week = 0.0

        for task in all_tasks:
            if task.status != "DONE" or not task.completed_at:
                continue

            completed_at = _as_utc(task.completed_at)
            if not completed_at:
                continue

            if completed_at >= start_of_month:
                completed_this_month += 1
                if task.is_paid:
                    earnings_this_month += task.payment_amount or 0.0

            if completed_at >= start_of_week:
                completed_this_week += 1
                if task.is_paid:
                    earnings_this_week += task.payment_amount or 0.0

        return UserStatsResponse(
            user_id=user.id,
            username=user.username,
            full_name=user.full_name or "",
            total_tasks=total_tasks,
            completed_tasks=completed_tasks,
            in_progress_tasks=in_progress_tasks,
            new_tasks=new_tasks,
            total_earnings=total_earnings,
            paid_tasks_count=paid_tasks_count,
            remote_tasks_count=remote_tasks_count,
            completed_this_month=completed_this_month,
            earnings_this_month=earnings_this_month,
            completed_this_week=completed_this_week,
            earnings_this_week=earnings_this_week,
        )

    def _get_or_404(self, user_id: int) -> UserModel:
        user = self.db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            raise UserServiceError("User not found", 404)
        return user

    def create(self, actor: UserModel, data: UserCreate) -> UserModel:
        """Создать пользователя.

        Org-admin не может создавать admin и ограничен лимитом организации;
        суперадмин может задать organization_id явно.
        """
        existing = (
            self.db.query(UserModel).filter(UserModel.username == data.username).first()
        )
        if existing:
            raise UserServiceError("Username already exists", 400)

        tenant = TenantFilter(actor)
        # Целевая организация пользователя (для валидации кастомной роли в скоупе).
        if tenant.is_superadmin:
            target_org_id = (
                None if data.role == UserRole.SUPERADMIN else data.organization_id
            )
        else:
            target_org_id = actor.organization_id
        if not is_valid_role(self.db, data.role, target_org_id):
            raise UserServiceError("Несуществующая группа (роль)", 400)
        requested_role = canonical_role_value(data.role)

        if not tenant.is_superadmin:
            if requested_role == UserRole.ADMIN.value:
                raise UserServiceError("Org-admin cannot create admin users", 403)
            if actor.organization and actor.organization.max_users:
                current_count = (
                    self.db.query(UserModel)
                    .filter(UserModel.organization_id == actor.organization_id)
                    .count()
                )
                if current_count >= actor.organization.max_users:
                    raise UserServiceError(
                        "Достигнут лимит пользователей организации "
                        f"({actor.organization.max_users})",
                        400,
                    )

        user = UserModel(
            username=data.username,
            password_hash=get_password_hash(data.password),
            full_name=data.full_name,
            email=data.email,
            phone=data.phone,
            role=requested_role,
        )
        # Привязка к организации:
        # - Суперадмин может указать organization_id явно
        # - Org-admin автоматически привязывает к своей организации
        if requested_role == UserRole.ADMIN.value and data.role == UserRole.SUPERADMIN:
            user.organization_id = None
        elif tenant.is_superadmin and data.organization_id:
            user.organization_id = data.organization_id
        else:
            tenant.set_org_id(user)

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        audit_user_created(actor.id, actor.username, user.id, user.username)
        return user

    def update(self, actor: UserModel, user_id: int, data: UserUpdate) -> UserModel:
        """Обновить пользователя. Org-admin ограничен своей организацией и ролями."""
        user = self._get_or_404(user_id)

        tenant = TenantFilter(actor)
        if data.role is not None and not is_valid_role(
            self.db, data.role, user.organization_id
        ):
            raise UserServiceError("Несуществующая группа (роль)", 400)
        requested_role = (
            canonical_role_value(data.role) if data.role is not None else None
        )
        if not tenant.is_superadmin:
            tenant.enforce_access(user)
            if requested_role == UserRole.ADMIN.value:
                raise UserServiceError("Org-admin cannot assign admin role", 403)

        if data.username is not None:
            new_username = data.username.strip()
            if not new_username:
                raise UserServiceError("Username cannot be empty", 400)
            existing_user = (
                self.db.query(UserModel)
                .filter(
                    UserModel.username == new_username,
                    UserModel.id != user.id,
                )
                .first()
            )
            if existing_user:
                raise UserServiceError("Username already exists", 400)
            user.username = new_username

        if data.password is not None:
            if not data.password:
                raise UserServiceError("Password cannot be empty", 400)
            user.password_hash = get_password_hash(data.password)

        if data.full_name is not None:
            user.full_name = data.full_name
        if data.email is not None:
            user.email = data.email
        if data.phone is not None:
            user.phone = data.phone
        if data.role is not None:
            user.role = requested_role
            if data.role == UserRole.SUPERADMIN:
                user.organization_id = None
        if data.is_active is not None:
            user.is_active = data.is_active

        self.db.commit()
        self.db.refresh(user)

        audit_user_updated(
            actor.id,
            actor.username,
            user_id,
            str(data.model_dump(exclude_unset=True)),
        )
        return user

    def delete(self, actor: UserModel, user_id: int) -> None:
        """Удалить пользователя. Org-admin ограничен своей организацией."""
        if user_id == actor.id:
            raise UserServiceError("Cannot delete yourself", 400)

        user = self._get_or_404(user_id)

        tenant = TenantFilter(actor)
        if not tenant.is_superadmin:
            tenant.enforce_access(user)

        self.db.delete(user)
        self.db.commit()
        audit_user_deleted(actor.id, actor.username, user_id, user.username)


def get_user_service(db: Session = Depends(get_db)) -> UserService:
    return UserService(db)
