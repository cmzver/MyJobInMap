"""
Tenant Service
==============
Сервис для управления организациями (multi-tenant).
"""

import logging
import re
from typing import List, Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.models import OrganizationModel, UserModel, UserRole, get_db
from app.models.base import utcnow
from app.services.auth import get_password_hash

logger = logging.getLogger(__name__)


def slugify(name: str) -> str:
    """Преобразует название в slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")[:100]


class TenantService:
    """Сервис для управления организациями."""

    def __init__(self, db: Session):
        self.db = db

    def _ensure_org_unique(self, name: str, slug: str) -> None:
        existing = (
            self.db.query(OrganizationModel)
            .filter((OrganizationModel.name == name) | (OrganizationModel.slug == slug))
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Организация с таким именем или slug уже существует",
            )

    def create(self, name: str, **kwargs) -> OrganizationModel:
        """Создать организацию."""
        slug = kwargs.pop("slug", None) or slugify(name)

        self._ensure_org_unique(name, slug)

        org = OrganizationModel(name=name, slug=slug, **kwargs)
        self.db.add(org)
        self.db.commit()
        self.db.refresh(org)

        logger.info(f"Организация '{name}' (slug={slug}) создана")
        return org

    def create_with_admin(
        self, name: str, admin_data: dict, **kwargs
    ) -> tuple[OrganizationModel, UserModel]:
        """Создать организацию вместе с первичным администратором в одной транзакции."""
        slug = kwargs.pop("slug", None) or slugify(name)

        self._ensure_org_unique(name, slug)

        existing_user = (
            self.db.query(UserModel)
            .filter(UserModel.username == admin_data["username"])
            .first()
        )
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already exists")

        org = OrganizationModel(name=name, slug=slug, **kwargs)
        self.db.add(org)
        self.db.flush()

        user = UserModel(
            username=admin_data["username"],
            password_hash=get_password_hash(admin_data["password"]),
            full_name=admin_data.get("full_name") or "",
            email=admin_data.get("email"),
            phone=admin_data.get("phone"),
            role=UserRole.ADMIN.value,
            organization_id=org.id,
            is_active=True,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(org)
        self.db.refresh(user)

        logger.info(
            "Организация '%s' (slug=%s) создана вместе с первичным администратором '%s'",
            name,
            slug,
            user.username,
        )
        return org, user

    def get_by_id(self, org_id: int) -> Optional[OrganizationModel]:
        """Получить организацию по ID."""
        return (
            self.db.query(OrganizationModel)
            .filter(OrganizationModel.id == org_id)
            .first()
        )

    def get_by_slug(self, slug: str) -> Optional[OrganizationModel]:
        """Получить организацию по slug."""
        return (
            self.db.query(OrganizationModel)
            .filter(OrganizationModel.slug == slug)
            .first()
        )

    def list_all(self, include_inactive: bool = False) -> List[OrganizationModel]:
        """Список всех организаций."""
        query = self.db.query(OrganizationModel)
        if not include_inactive:
            query = query.filter(OrganizationModel.is_active == True)
        return query.order_by(OrganizationModel.name).all()

    def update(self, org_id: int, **kwargs) -> Optional[OrganizationModel]:
        """Обновить организацию."""
        org = self.get_by_id(org_id)
        if not org:
            return None

        for key, value in kwargs.items():
            if hasattr(org, key) and value is not None:
                setattr(org, key, value)

        org.updated_at = utcnow()
        self.db.commit()
        self.db.refresh(org)
        return org

    def deactivate(self, org_id: int) -> Optional[OrganizationModel]:
        """Деактивировать организацию."""
        return self.update(org_id, is_active=False)

    def get_user_count(self, org_id: int) -> int:
        """Количество пользователей в организации."""
        return (
            self.db.query(UserModel)
            .filter(UserModel.organization_id == org_id, UserModel.is_active == True)
            .count()
        )

    def assign_user(self, user_id: int, org_id: int) -> UserModel:
        """Назначить пользователя в организацию."""
        user = self.db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        org = self.get_by_id(org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Организация не найдена")

        if not org.is_active:
            raise HTTPException(status_code=400, detail="Организация неактивна")

        # Проверка лимита пользователей
        current_count = self.get_user_count(org_id)
        if current_count >= org.max_users:
            raise HTTPException(
                status_code=400,
                detail=f"Превышен лимит пользователей ({org.max_users})",
            )

        user.organization_id = org_id
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Пользователь {user.username} назначен в организацию '{org.name}'")
        return user


def get_tenant_service(db: Session = Depends(get_db)) -> TenantService:
    """FastAPI dependency для TenantService."""
    return TenantService(db)
