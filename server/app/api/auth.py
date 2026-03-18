"""
Auth API
========
Эндпоинты аутентификации.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict
<<<<<<< HEAD
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status, File, UploadFile
from fastapi.responses import FileResponse
=======
from fastapi import APIRouter, Depends, HTTPException, Request, status
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import UserModel, RolePermissionModel, get_db, init_default_settings
from app.config import settings
from app.schemas import (
    Token, RefreshRequest, UserResponse,
    ReportSettingsUpdate, ReportSettingsResponse
)
from app.services.audit_log import audit_login_success, audit_login_failed
from app.services import (
    authenticate_user, create_access_token, create_refresh_token, verify_refresh_token,
    get_current_user_required, get_password_hash, verify_password
)
from app.services.rate_limiter import login_rate_limiter
from app.utils import build_user_avatar_url, user_to_response


router = APIRouter(prefix="/api/auth", tags=["Auth"])


class ProfileUpdate(BaseModel):
    """Обновление профиля"""
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class PasswordChange(BaseModel):
    """Смена пароля"""
    current_password: str
    new_password: str


class PermissionsResponse(BaseModel):
    """Разрешения текущего пользователя"""
    role: str
    permissions: Dict[str, bool]


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Авторизация пользователя.

    **Rate Limiting**: Максимум 5 попыток входа в течение 60 секунд с одного IP адреса.

    Args:
        request: HTTP request (for extracting client IP)
        form_data: OAuth2 форма с username и password
        db: Database session

    Returns:
        Token with access_token, user info, and role

    Raises:
        429 Too Many Requests: Если превышено количество попыток входа
        401 Unauthorized: Если неверные учётные данные
    """
    # Получить IP адрес клиента (поддержка TestClient и реальных запросов)
    if request.client:
        client_ip = request.client.host
    else:
        # Для TestClient и других случаев используем значение по умолчанию
        client_ip = request.headers.get("x-forwarded-for", "127.0.0.1").split(",")[0].strip()

    # Проверить rate limit
    is_allowed, remaining = login_rate_limiter.is_allowed(client_ip)
    
    if not is_allowed:
        retry_after = login_rate_limiter.get_retry_after(client_ip)
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много попыток входа. Попробуйте через {retry_after} сек.",
            headers={"Retry-After": str(retry_after)}
        )
    
    # Аутентифицировать пользователя
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        audit_login_failed(form_data.username, client_ip)
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    
    # Успешный вход - сбросить counter
    login_rate_limiter.reset(client_ip)
    audit_login_success(user.id, user.username, client_ip)
    
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    
    token_data = {"sub": user.username, "user_id": user.id, "role": user.role}
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)
    
    # Получаем данные организации
    org_id = user.organization_id
    org_name = None
    if org_id and user.organization:
        org_name = user.organization.name

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user_id=user.id,
        username=user.username,
        role=user.role,
        full_name=user.full_name or user.username,
<<<<<<< HEAD
        avatar_url=build_user_avatar_url(user),
=======
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
        organization_id=org_id,
        organization_name=org_name
    )


@router.get("/avatar/{user_id}/{file_name}", include_in_schema=False)
async def get_user_avatar(user_id: int, file_name: str, db: Session = Depends(get_db)):
    """Получить аватар пользователя по публичному URL."""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user or not user.avatar_path:
        raise HTTPException(status_code=404, detail="Avatar not found")

    avatar_path = Path(user.avatar_path)
    if avatar_path.name != file_name:
        raise HTTPException(status_code=404, detail="Avatar not found")

    full_path = (settings.UPLOADS_DIR / avatar_path).resolve()
    avatars_root = (settings.UPLOADS_DIR / "avatars").resolve()
    if avatars_root not in full_path.parents:
        raise HTTPException(status_code=404, detail="Avatar not found")
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Avatar not found")

    return FileResponse(full_path)


@router.get("/me", response_model=UserResponse)
async def get_me(user: UserModel = Depends(get_current_user_required)):
    """Получить текущего пользователя"""
    return user_to_response(user)


@router.post("/refresh", response_model=Token)
async def refresh_token(
    data: RefreshRequest,
    db: Session = Depends(get_db)
):
    """
    Обновить access token с помощью refresh token.
    
    Возвращает новую пару access + refresh токенов.
    Старый refresh token становится невалидным (ротация).
    
    Args:
        data: Запрос с refresh_token
        db: Database session
    
    Returns:
        Новая пара токенов + информация о пользователе
    
    Raises:
        401 Unauthorized: Если refresh token невалидный или истёк
    """
    payload = verify_refresh_token(data.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    user_id = payload.get("user_id")
    username = payload.get("sub")
    
    if not user_id or not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload"
        )
    
    # Проверяем, что пользователь существует и активен
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated"
        )
    
    # Проверяем, что организация активна
    if user.organization_id and user.organization:
        if not user.organization.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Организация деактивирована"
            )
    
    # Проверяем что username совпадает (защита от переиспользования ID)
    if user.username != username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token mismatch"
        )
    
    # Создаём новую пару токенов (ротация)
    token_data = {"sub": user.username, "user_id": user.id, "role": user.role}
    new_access_token = create_access_token(data=token_data)
    new_refresh_token = create_refresh_token(data=token_data)
    
    # Получаем данные организации для refresh
    refresh_org_id = user.organization_id
    refresh_org_name = None
    if refresh_org_id and user.organization:
        refresh_org_name = user.organization.name

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        user_id=user.id,
        username=user.username,
        role=user.role,
<<<<<<< HEAD
        full_name=user.full_name or user.username,
        avatar_url=build_user_avatar_url(user),
        organization_id=refresh_org_id,
        organization_name=refresh_org_name
    )


=======
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        assigned_tasks_count=len(user.assigned_tasks) if user.assigned_tasks else 0,
        organization_id=user.organization_id
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(
    data: RefreshRequest,
    db: Session = Depends(get_db)
):
    """
    Обновить access token с помощью refresh token.
    
    Возвращает новую пару access + refresh токенов.
    Старый refresh token становится невалидным (ротация).
    
    Args:
        data: Запрос с refresh_token
        db: Database session
    
    Returns:
        Новая пара токенов + информация о пользователе
    
    Raises:
        401 Unauthorized: Если refresh token невалидный или истёк
    """
    payload = verify_refresh_token(data.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    user_id = payload.get("user_id")
    username = payload.get("sub")
    
    if not user_id or not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload"
        )
    
    # Проверяем, что пользователь существует и активен
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated"
        )
    
    # Проверяем, что организация активна
    if user.organization_id and user.organization:
        if not user.organization.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Организация деактивирована"
            )
    
    # Проверяем что username совпадает (защита от переиспользования ID)
    if user.username != username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token mismatch"
        )
    
    # Создаём новую пару токенов (ротация)
    token_data = {"sub": user.username, "user_id": user.id, "role": user.role}
    new_access_token = create_access_token(data=token_data)
    new_refresh_token = create_refresh_token(data=token_data)
    
    # Получаем данные организации для refresh
    refresh_org_id = user.organization_id
    refresh_org_name = None
    if refresh_org_id and user.organization:
        refresh_org_name = user.organization.name

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        user_id=user.id,
        username=user.username,
        role=user.role,
        full_name=user.full_name or user.username,
        organization_id=refresh_org_id,
        organization_name=refresh_org_name
    )


>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    data: ProfileUpdate,
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Обновить профиль текущего пользователя"""
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        user.email = data.email
    if data.phone is not None:
        user.phone = data.phone
    
    db.commit()
    db.refresh(user)
<<<<<<< HEAD

    return user_to_response(user)


@router.post("/avatar", response_model=UserResponse)
async def upload_avatar(
    avatar: UploadFile = File(...),
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Загрузить аватар текущего пользователя."""
    if not avatar.content_type or not avatar.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Разрешены только изображения")

    content = await avatar.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Размер файла не должен превышать 5 МБ")

    extension = Path(avatar.filename or "avatar").suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(status_code=400, detail="Поддерживаются JPG, PNG, WEBP и GIF")

    avatar_dir = settings.UPLOADS_DIR / "avatars" / str(user.id)
    avatar_dir.mkdir(parents=True, exist_ok=True)

    if user.avatar_path:
        old_path = (settings.UPLOADS_DIR / user.avatar_path).resolve()
        avatars_root = (settings.UPLOADS_DIR / "avatars").resolve()
        if avatars_root in old_path.parents and old_path.exists() and old_path.is_file():
            old_path.unlink(missing_ok=True)

    file_name = f"{uuid4().hex}{extension}"
    relative_path = Path("avatars") / str(user.id) / file_name
    destination = settings.UPLOADS_DIR / relative_path
    destination.write_bytes(content)

    user.avatar_path = relative_path.as_posix()
    db.commit()
    db.refresh(user)

    return user_to_response(user)


=======
    
    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name or "",
        email=user.email,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        assigned_tasks_count=len(user.assigned_tasks) if user.assigned_tasks else 0,
        organization_id=user.organization_id
    )


>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
@router.patch("/password")
async def change_password(
    data: PasswordChange,
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Изменить пароль текущего пользователя"""
    # Проверка текущего пароля
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    
    # Валидация нового пароля
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен быть не менее 6 символов")
    
    # Обновление пароля
    user.password_hash = get_password_hash(data.new_password)
    db.commit()
    
    return {"success": True, "message": "Пароль успешно изменён"}


@router.get("/report-settings", response_model=ReportSettingsResponse)
async def get_report_settings(
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Получить настройки отправки отчётов"""
    return ReportSettingsResponse(
        report_target=user.report_target or "group",
        report_contact_phone=user.report_contact_phone
    )


@router.get("/permissions", response_model=PermissionsResponse)
async def get_my_permissions(
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Получить разрешения текущего пользователя"""
    init_default_settings(db)
    perms = db.query(RolePermissionModel).filter(RolePermissionModel.role == user.role).all()
    permissions = {perm.permission: perm.is_allowed for perm in perms}
    return PermissionsResponse(role=user.role, permissions=permissions)


@router.patch("/report-settings", response_model=ReportSettingsResponse)
async def update_report_settings(
    settings: ReportSettingsUpdate,
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Обновить настройки отправки отчётов"""
    if settings.report_target not in ("group", "contact", "none"):
        raise HTTPException(status_code=400, detail="Invalid report_target")
    
    if settings.report_target == "contact" and not settings.report_contact_phone:
        raise HTTPException(status_code=400, detail="Phone required for 'contact' target")
    
    user.report_target = settings.report_target
    user.report_contact_phone = settings.report_contact_phone
    
    db.commit()
    db.refresh(user)
    
    return ReportSettingsResponse(
        report_target=user.report_target,
        report_contact_phone=user.report_contact_phone
    )
