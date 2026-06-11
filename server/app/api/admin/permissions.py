"""
Admin Permissions API
======================
Матрица прав ролей (dispatcher/worker) и её обновление. Тонкие контроллеры.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models import RolePermissionModel, UserModel, get_db
from app.schemas import RolePermissionsResponse, UpdateRolePermissionRequest
from app.services import get_current_superadmin

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/permissions", response_model=RolePermissionsResponse)
async def get_permissions(
    db: Session = Depends(get_db), admin: UserModel = Depends(get_current_superadmin)
):
    """Получить матрицу прав доступа"""
    perms = db.query(RolePermissionModel).all()
    result = {"admin": {}, "dispatcher": {}, "worker": {}}

    # Заполняем дефолтные права если база пуста (упрощение)
    default_permissions = [
        # Worker
        ("worker", "view_tasks", True),
        ("worker", "change_task_status", True),
        ("worker", "view_comments", True),
        ("worker", "add_comments", True),
        ("worker", "add_photos", True),
        # Dispatcher
        ("dispatcher", "view_dashboard", True),
        ("dispatcher", "view_tasks", True),
        ("dispatcher", "create_tasks", True),
        ("dispatcher", "edit_tasks", True),
        ("dispatcher", "view_users", True),
    ]

    if not perms:
        for role, perm, val in default_permissions:
            db.add(RolePermissionModel(role=role, permission=perm, is_allowed=val))
        db.commit()
        perms = db.query(RolePermissionModel).all()

    for p in perms:
        if p.role in result:
            result[p.role][p.permission] = p.is_allowed

    # Admin всегда имеет всё (виртуально)

    return result


@router.patch("/permissions/{role}")
async def update_role_permission(
    role: str,
    update: UpdateRolePermissionRequest,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Обновить права роли"""
    if role not in ["dispatcher", "worker"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    for perm, allowed in update.permissions.items():
        db_perm = (
            db.query(RolePermissionModel)
            .filter(
                RolePermissionModel.role == role, RolePermissionModel.permission == perm
            )
            .first()
        )

        if db_perm:
            db_perm.is_allowed = allowed
        else:
            db.add(RolePermissionModel(role=role, permission=perm, is_allowed=allowed))

    db.commit()
    return {"message": "Permissions updated"}
