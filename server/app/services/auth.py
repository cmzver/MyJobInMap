"""
Auth Service
============
Сервис аутентификации и авторизации.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Callable

import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserModel, UserRole, TaskModel, get_db


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля"""
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )


def get_password_hash(password: str) -> str:
    """Хеширование пароля"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создание JWT токена"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def authenticate_user(db: Session, username: str, password: str) -> Optional[UserModel]:
    """Аутентификация пользователя"""
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if not user or not verify_password(password, user.password_hash):
        return None
    if not user.is_active:
        return None
    return user


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[UserModel]:
    """Получить текущего пользователя (опционально)"""
    if not token:
        return None
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("user_id")
        username_from_token = payload.get("sub")
        
        if user_id is None:
            return None
    except JWTError:
        return None
    
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    
    if user is None or not user.is_active:
        return None
    
    # Проверяем что username в токене совпадает с username в БД
    # Это защита от ситуации, когда пользователь был удалён и ID переиспользован
    if username_from_token and user.username != username_from_token:
        return None
    
    return user


async def get_current_user_required(
    user: Optional[UserModel] = Depends(get_current_user)
) -> UserModel:
    """Требует авторизованного пользователя"""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_admin(
    user: UserModel = Depends(get_current_user_required)
) -> UserModel:
    """Требует администратора"""
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user


async def get_current_dispatcher_or_admin(
    user: UserModel = Depends(get_current_user_required)
) -> UserModel:
    """Требует диспетчера или администратора"""
    if user.role not in (UserRole.ADMIN.value, UserRole.DISPATCHER.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dispatcher or admin access required"
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
    
    # Админ имеет все права
    if user.role == UserRole.ADMIN.value:
        return True
    
    # Проверяем в таблице прав
    perm = db.query(RolePermissionModel).filter(
        RolePermissionModel.role == user.role,
        RolePermissionModel.permission == permission
    ).first()
    
    if perm:
        return perm.is_allowed
    
    # По умолчанию - запрещено
    return False


def require_permission(permission: str, detail: str = "Permission denied") -> Callable:
    """Return a dependency that enforces a single permission."""
    async def _dependency(
        user: UserModel = Depends(get_current_user_required),
        db: Session = Depends(get_db)
    ) -> UserModel:
        if not check_permission(db, user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=detail
            )
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
        role=UserRole.ADMIN.value
    )
    db.add(admin)
    
    worker = UserModel(
        username="user",
        password_hash=get_password_hash("user"),
        full_name="Работник",
        role=UserRole.WORKER.value
    )
    db.add(worker)
    
    db.commit()
    print("Default users created: admin/admin, user/user")


def enforce_worker_task_access(
    user: UserModel,
    task: TaskModel,
    detail: str = "Access denied"
) -> None:
    """Raise 403 if a worker tries to access a task not assigned to them."""
    if user.role == UserRole.WORKER.value and task.assigned_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail
        )
