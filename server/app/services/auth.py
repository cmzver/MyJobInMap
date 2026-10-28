"""
Auth Service
============
Сервис аутентификации и авторизации.
"""

import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models import RefreshSessionModel, TaskModel, UserModel, UserRole, get_db
from app.services.role_utils import (
    canonical_role_value,
    is_admin_user,
    is_dispatcher_or_admin_user,
    is_superadmin_user,
    is_worker_user,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

logger = logging.getLogger(__name__)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля"""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def get_password_hash(password: str) -> str:
    """Хеширование пароля"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создание JWT access токена (короткоживущий)"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создание JWT refresh токена (долгоживущий, 30 дней)"""
    to_encode = {
        "sub": data.get("sub"),
        "user_id": data.get("user_id"),
        "auth_version": data.get("auth_version", 0),
        "jti": data.get("jti", uuid.uuid4().hex),
        "family_id": data.get("family_id", uuid.uuid4().hex),
    }
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_refresh_token(
    db: Session, user: UserModel, *, family_id: Optional[str] = None
) -> str:
    """Создать и сохранить одноразовый refresh token."""
    jti = uuid.uuid4().hex
    family = family_id or uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    token = create_refresh_token(
        {
            "sub": user.username,
            "user_id": user.id,
            "auth_version": user.auth_version,
            "jti": jti,
            "family_id": family,
        },
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(
        RefreshSessionModel(
            jti=jti,
            family_id=family,
            user_id=user.id,
            token_hash=_token_hash(token),
            expires_at=expires_at,
        )
    )
    db.commit()
    return token


def rotate_refresh_token(
    db: Session, token: str, payload: dict, user: UserModel
) -> Optional[str]:
    """Атомарно погасить старый refresh token и выпустить следующий.

    Повторное предъявление уже погашенного токена блокирует всю его семью —
    это ограничивает ущерб при краже refresh token.
    """
    jti = payload.get("jti")
    family_id = payload.get("family_id")
    if not isinstance(jti, str) or not isinstance(family_id, str):
        return None

    session = db.get(RefreshSessionModel, jti)
    if (
        session is None
        or session.user_id != user.id
        or session.family_id != family_id
        or session.token_hash != _token_hash(token)
    ):
        return None

    now = datetime.now(timezone.utc)
    if session.revoked_at is not None:
        db.query(RefreshSessionModel).filter(
            RefreshSessionModel.family_id == family_id,
            RefreshSessionModel.revoked_at.is_(None),
        ).update({RefreshSessionModel.revoked_at: now}, synchronize_session=False)
        db.commit()
        return None

    next_jti = uuid.uuid4().hex
    updated = (
        db.query(RefreshSessionModel)
        .filter(
            RefreshSessionModel.jti == jti,
            RefreshSessionModel.revoked_at.is_(None),
        )
        .update(
            {
                RefreshSessionModel.revoked_at: now,
                RefreshSessionModel.replaced_by_jti: next_jti,
            },
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        return None

    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    new_token = create_refresh_token(
        {
            "sub": user.username,
            "user_id": user.id,
            "auth_version": user.auth_version,
            "jti": next_jti,
            "family_id": family_id,
        },
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(
        RefreshSessionModel(
            jti=next_jti,
            family_id=family_id,
            user_id=user.id,
            token_hash=_token_hash(new_token),
            expires_at=expires_at,
        )
    )
    db.commit()
    return new_token


def revoke_user_refresh_sessions(db: Session, user_id: int) -> None:
    """Погасить все активные refresh-сессии пользователя без commit."""
    db.query(RefreshSessionModel).filter(
        RefreshSessionModel.user_id == user_id,
        RefreshSessionModel.revoked_at.is_(None),
    ).update(
        {RefreshSessionModel.revoked_at: datetime.now(timezone.utc)},
        synchronize_session=False,
    )


def verify_refresh_token(token: str) -> Optional[dict]:
    """Проверка refresh токена. Возвращает payload или None."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None


def authenticate_user(db: Session, username: str, password: str) -> Optional[UserModel]:
    """Аутентификация пользователя"""
    user = db.query(UserModel).filter(UserModel.username == username).first()
    password_hash = getattr(user, "password_hash", None)
    if (
        not user
        or password_hash is None
        or not verify_password(password, password_hash)
    ):
        return None
    if not getattr(user, "is_active", False):
        return None
    # Проверяем, что организация пользователя активна
    org_id = getattr(user, "organization_id", None)
    org = getattr(user, "organization", None)
    if org_id is not None and (org is None or not getattr(org, "is_active", False)):
        return None
    return user


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Optional[UserModel]:
    """Получить текущего пользователя (опционально)"""
    if not token:
        return None

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id = payload.get("user_id")
        username_from_token = payload.get("sub")
        if payload.get("type") != "access" or user_id is None:
            return None
    except JWTError:
        return None

    user = db.query(UserModel).filter(UserModel.id == user_id).first()

    if user is None or not getattr(user, "is_active", False):
        return None

    if payload.get("auth_version", 0) != getattr(user, "auth_version", 0):
        return None

    if user.organization_id is not None and (
        user.organization is None or not user.organization.is_active
    ):
        return None

    # Проверяем что username в токене совпадает с username в БД
    # Это защита от ситуации, когда пользователь был удалён и ID переиспользован
    if username_from_token and user.username != username_from_token:
        return None

    return user


def get_current_user_required(
    user: Optional[UserModel] = Depends(get_current_user),
) -> UserModel:
    """Требует авторизованного пользователя"""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_admin(
    user: UserModel = Depends(get_current_user_required),
) -> UserModel:
    """Требует администратора"""
    if not is_admin_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user


def get_current_superadmin(
    user: UserModel = Depends(get_current_admin),
) -> UserModel:
    """Требует суперадмина (admin без organization_id)"""
    if not is_superadmin_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required"
        )
    return user


def get_current_dispatcher_or_admin(
    user: UserModel = Depends(get_current_user_required),
) -> UserModel:
    """Требует диспетчера или администратора"""
    if not is_dispatcher_or_admin_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dispatcher or admin access required",
        )
    return user


def check_permission(db: Session, user: UserModel, permission: str) -> bool:
    """Проверить право доступа для пользователя

    Args:
        db: Сессия БД
        user: Пользователь
        permission: Код права (например, 'add_photos', 'delete_photos')

    Returns:
        True если право разрешено, False иначе
    """
    from app.models import RolePermissionModel
    from app.services.user_group_service import BASE_ACCESS_LEVELS

    # Админ имеет все права
    if is_admin_user(user):
        return True

    # Скоуп прав: встроенные роли — глобальные (NULL), кастомные группы —
    # в рамках организации пользователя.
    canonical = canonical_role_value(user.role)
    org_scope = (
        None
        if canonical in BASE_ACCESS_LEVELS
        else getattr(user, "organization_id", None)
    )
    perm = (
        db.query(RolePermissionModel)
        .filter(
            RolePermissionModel.role == canonical,
            RolePermissionModel.permission == permission,
            RolePermissionModel.organization_id == org_scope,
        )
        .first()
    )

    if perm:
        return bool(getattr(perm, "is_allowed", False))

    # По умолчанию - запрещено
    return False


def require_permission(permission: str, detail: str = "Permission denied") -> Callable:
    """Return a dependency that enforces a single permission."""

    def _dependency(
        user: UserModel = Depends(get_current_user_required),
        db: Session = Depends(get_db),
    ) -> UserModel:
        if not check_permission(db, user, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
        return user

    return _dependency


def create_default_users(db: Session):
    """Создание пользователей по умолчанию"""
    if db.query(UserModel).count() > 0:
        return

    admin = UserModel(
        username="admin",
        password_hash=get_password_hash("admin"),
        full_name="Администратор",
        role=UserRole.ADMIN.value,
    )
    db.add(admin)

    worker = UserModel(
        username="user",
        password_hash=get_password_hash("user"),
        full_name="Работник",
        role=UserRole.WORKER.value,
    )
    db.add(worker)

    db.commit()
    logger.info("Default users created: admin/admin, user/user")


def enforce_worker_task_access(
    user: UserModel, task: TaskModel, detail: str = "Access denied"
) -> None:
    """Raise 403 if a user tries to access a task outside their tenant or worker scope."""
    from app.services.tenant_filter import TenantFilter

    tenant = TenantFilter(user)
    tenant.enforce_access(task, detail=detail)

    if is_worker_user(user) and getattr(task, "assigned_user_id", None) != getattr(
        user, "id", None
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
