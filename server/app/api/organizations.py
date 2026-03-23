"""
Organizations API
==================
Управление организациями (multi-tenant).

Доступно только суперадминам (admin без organization_id).
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models import OrganizationModel, TaskModel, UserModel, get_db
from app.models.address import AddressModel
from app.services import require_permission
from app.services.tenant_service import TenantService, get_tenant_service

router = APIRouter(prefix="/api/admin/organizations", tags=["Organizations"])
logger = logging.getLogger(__name__)


# === Pydantic schemas ===


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    max_users: int = Field(default=50, ge=1, le=10000)
    max_tasks: int = Field(default=10000, ge=1, le=1000000)
    initial_admin: Optional["InitialAdminCreate"] = None


class InitialAdminCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=4, max_length=128)
    full_name: str = Field(default="", max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    max_users: Optional[int] = Field(None, ge=1, le=10000)
    max_tasks: Optional[int] = Field(None, ge=1, le=1000000)
    is_active: Optional[bool] = None


class OrganizationResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    max_users: int
    max_tasks: int
    user_count: int = 0
    task_count: int = 0
    address_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class AssignUserRequest(BaseModel):
    user_id: int
    organization_id: int


def _require_superadmin(
    user: UserModel = Depends(require_permission("manage_organizations")),
):
    """Проверить, что пользователь — суперадмин (admin без организации)."""
    if user.organization_id is not None:
        raise HTTPException(
            status_code=403,
            detail="Управление организациями доступно только суперадминам",
        )
    return user


def _org_to_response(org: OrganizationModel, db: Session) -> OrganizationResponse:
    """Конвертировать модель в response."""
    user_count = (
        db.query(UserModel)
        .filter(UserModel.organization_id == org.id, UserModel.is_active == True)
        .count()
    )
    task_count = db.query(TaskModel).filter(TaskModel.organization_id == org.id).count()
    address_count = (
        db.query(AddressModel).filter(AddressModel.organization_id == org.id).count()
    )

    return OrganizationResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        description=org.description,
        email=org.email,
        phone=org.phone,
        address=org.address,
        is_active=org.is_active,
        max_users=org.max_users,
        max_tasks=org.max_tasks,
        user_count=user_count,
        task_count=task_count,
        address_count=address_count,
        created_at=org.created_at.isoformat() if org.created_at else None,
        updated_at=org.updated_at.isoformat() if org.updated_at else None,
    )


# === Endpoints ===


@router.get("")
async def list_organizations(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: UserModel = Depends(_require_superadmin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """Список всех организаций."""
    orgs = tenant_service.list_all(include_inactive=include_inactive)
    return [_org_to_response(org, db) for org in orgs]


@router.post("", status_code=201)
async def create_organization(
    data: OrganizationCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(_require_superadmin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """Создать организацию."""
    payload = data.model_dump(exclude_none=True)
    initial_admin = payload.pop("initial_admin", None)

    if initial_admin:
        org, created_admin = tenant_service.create_with_admin(
            **payload,
            admin_data=initial_admin,
        )
        logger.info(
            "Организация '%s' и её первичный администратор '%s' созданы пользователем %s",
            org.name,
            created_admin.username,
            user.username,
        )
    else:
        org = tenant_service.create(**payload)
        logger.info(f"Организация '{org.name}' создана пользователем {user.username}")

    return _org_to_response(org, db)


@router.get("/{org_id}")
async def get_organization(
    org_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(_require_superadmin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """Получить организацию по ID."""
    org = tenant_service.get_by_id(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    return _org_to_response(org, db)


@router.patch("/{org_id}")
async def update_organization(
    org_id: int,
    data: OrganizationUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(_require_superadmin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """Обновить организацию."""
    org = tenant_service.update(org_id, **data.model_dump(exclude_none=True))
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    logger.info(f"Организация '{org.name}' обновлена пользователем {user.username}")
    return _org_to_response(org, db)


@router.delete("/{org_id}")
async def deactivate_organization(
    org_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(_require_superadmin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """Деактивировать организацию (soft delete)."""
    org = tenant_service.deactivate(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    logger.info(
        f"Организация '{org.name}' деактивирована пользователем {user.username}"
    )
    return {"message": f"Организация '{org.name}' деактивирована"}


@router.post("/assign-user")
async def assign_user_to_organization(
    data: AssignUserRequest,
    user: UserModel = Depends(_require_superadmin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """Назначить пользователя в организацию."""
    updated_user = tenant_service.assign_user(data.user_id, data.organization_id)
    return {
        "message": f"Пользователь '{updated_user.username}' назначен в организацию",
        "user_id": updated_user.id,
        "organization_id": updated_user.organization_id,
    }


@router.post("/{org_id}/activate")
async def activate_organization(
    org_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(_require_superadmin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """Реактивировать деактивированную организацию."""
    org = tenant_service.update(org_id, is_active=True)
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    logger.info(
        f"Организация '{org.name}' реактивирована пользователем {user.username}"
    )
    return _org_to_response(org, db)


@router.post("/{org_id}/unassign-user")
async def unassign_user_from_organization(
    org_id: int,
    data: dict,
    db: Session = Depends(get_db),
    user: UserModel = Depends(_require_superadmin),
):
    """Убрать пользователя из организации."""
    user_id = data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id обязателен")

    target_user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if target_user.organization_id != org_id:
        raise HTTPException(
            status_code=400, detail="Пользователь не привязан к этой организации"
        )

    target_user.organization_id = None
    db.commit()

    logger.info(f"Пользователь '{target_user.username}' убран из организации #{org_id}")
    return {"message": f"Пользователь '{target_user.username}' убран из организации"}


@router.get("/{org_id}/users")
async def get_organization_users(
    org_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(_require_superadmin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """Получить пользователей организации."""
    org = tenant_service.get_by_id(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")

    users = (
        db.query(UserModel)
        .filter(UserModel.organization_id == org_id)
        .order_by(UserModel.full_name)
        .all()
    )

    from app.utils import user_to_response

    return [user_to_response(u) for u in users]
