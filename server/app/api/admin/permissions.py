"""
Admin Permissions & Groups API
==============================
Реестр групп пользователей (кастомных ролей) и матрица их прав — в скоупе
организации. Орг-админ управляет группами СВОЕЙ организации; суперадмин может
указать ?organization_id= для управления группами выбранной организации, а без
него — глобальными встроенными ролями. Тонкие контроллеры поверх
user_group_service; права лежат в role_permissions.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import RolePermissionModel, UserModel, get_db
from app.schemas import (
    RolePermissionsResponse,
    UpdateRolePermissionRequest,
    UserGroupCreate,
    UserGroupResponse,
    UserGroupUpdate,
)
from app.services import get_current_admin, user_group_service
from app.services.role_utils import is_superadmin_user
from app.services.user_group_service import UserGroupServiceError

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def _effective_org(admin: UserModel, organization_id: Optional[int]) -> Optional[int]:
    """Скоуп операций с группами.

    Орг-админ всегда ограничен своей организацией. Суперадмин может выбрать
    организацию через ?organization_id (иначе работает с глобальными ролями).
    """
    if is_superadmin_user(admin):
        return organization_id
    return admin.organization_id


# ============================================
# Permissions matrix
# ============================================


@router.get("/permissions", response_model=RolePermissionsResponse)
async def get_permissions(
    organization_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Матрица прав по группам в скоупе организации (admin виртуально имеет всё)."""
    org_id = _effective_org(admin, organization_id)
    groups = user_group_service.list_groups(db, org_id)
    result: dict[str, dict[str, bool]] = {group.name: {} for group in groups}

    perms = (
        db.query(RolePermissionModel)
        .filter(
            or_(
                RolePermissionModel.organization_id.is_(None),
                RolePermissionModel.organization_id == org_id,
            )
        )
        .all()
    )
    for perm in perms:
        # Учитываем только права групп, попавших в скоуп (имена уникальны в скоупе).
        if perm.role in result:
            result[perm.role][perm.permission] = bool(perm.is_allowed)

    # admin всегда имеет все права (виртуально), матрица его не редактирует.
    for permission in user_group_service.PERMISSION_CODES:
        result.setdefault("admin", {})[permission] = True

    return result


@router.patch("/permissions/{role}")
async def update_role_permission(
    role: str,
    update: UpdateRolePermissionRequest,
    organization_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Обновить права группы (admin неизменен; встроенные — только суперадмин)."""
    if role == "admin":
        raise HTTPException(status_code=400, detail="Права администратора неизменны")

    org_id = _effective_org(admin, organization_id)

    # Встроенная (глобальная) роль определяется по имени — редактирует только
    # суперадмин (имена встроенных групп совпадают с уровнями base_access).
    if role in user_group_service.BASE_ACCESS_LEVELS:
        if not is_superadmin_user(admin):
            raise HTTPException(
                status_code=403, detail="Встроенные роли редактирует суперадмин"
            )
        perm_org = None
    else:
        group = user_group_service.get_group(db, role, org_id)
        if group is None:
            raise HTTPException(status_code=404, detail="Группа не найдена")
        perm_org = group.organization_id

    for perm, allowed in update.permissions.items():
        db_perm = (
            db.query(RolePermissionModel)
            .filter(
                RolePermissionModel.role == role,
                RolePermissionModel.permission == perm,
                RolePermissionModel.organization_id == perm_org,
            )
            .first()
        )
        if db_perm:
            db_perm.is_allowed = allowed
        else:
            db.add(
                RolePermissionModel(
                    role=role,
                    permission=perm,
                    is_allowed=allowed,
                    organization_id=perm_org,
                )
            )

    db.commit()
    return {"message": "Permissions updated"}


# ============================================
# User groups (custom roles)
# ============================================


@router.get("/groups", response_model=List[UserGroupResponse])
async def list_groups(
    organization_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Список групп в скоупе организации (встроенные + кастомные этой org)."""
    return user_group_service.list_groups(db, _effective_org(admin, organization_id))


@router.post("/groups", response_model=UserGroupResponse, status_code=201)
async def create_group(
    data: UserGroupCreate,
    organization_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Создать кастомную группу в организации (права засеваются как deny)."""
    try:
        return user_group_service.create_group(
            db, data, _effective_org(admin, organization_id)
        )
    except UserGroupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.patch("/groups/{name}", response_model=UserGroupResponse)
async def update_group(
    name: str,
    data: UserGroupUpdate,
    organization_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Обновить группу своей организации (slug неизменен у встроенных)."""
    try:
        return user_group_service.update_group(
            db, name, data, _effective_org(admin, organization_id)
        )
    except UserGroupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.delete("/groups/{name}")
async def delete_group(
    name: str,
    organization_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    """Удалить кастомную группу своей организации (если не системная и не используется)."""
    try:
        user_group_service.delete_group(
            db, name, _effective_org(admin, organization_id)
        )
    except UserGroupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"message": "Group deleted", "name": name}
