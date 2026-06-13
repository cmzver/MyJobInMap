"""
Auth API — session
==================
Выдача и ротация токенов: вход (с rate-limit и IP-guard) и refresh.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.models import UserModel, get_db
from app.schemas import RefreshRequest, Token
from app.services import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
)
from app.services.audit_log import audit_login_failed, audit_login_success
from app.services.ip_guard import ip_guard
from app.services.rate_limiter import login_rate_limiter
from app.services.role_utils import public_role_value
from app.utils import build_user_avatar_url

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _build_token_response(user: UserModel) -> Token:
    """Собрать пару токенов и публичный профиль пользователя."""
    token_data = {"sub": user.username, "user_id": user.id, "role": user.role}
    org_id = user.organization_id
    org_name = user.organization.name if org_id and user.organization else None
    return Token(
        access_token=create_access_token(data=token_data),
        refresh_token=create_refresh_token(data=token_data),
        token_type="bearer",
        user_id=user.id,
        username=user.username,
        role=public_role_value(user.role, user.organization_id),
        full_name=user.full_name or user.username,
        avatar_url=build_user_avatar_url(user),
        organization_id=org_id,
        organization_name=org_name,
    )


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
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
    # Получить реальный IP клиента (с учётом реверс-прокси, если TRUST_PROXY_HEADERS)
    client_ip = ip_guard.get_client_ip(request)

    # Проверить rate limit
    is_allowed, remaining = login_rate_limiter.is_allowed(client_ip)

    if not is_allowed:
        retry_after = login_rate_limiter.get_retry_after(client_ip)
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много попыток входа. Попробуйте через {retry_after} сек.",
            headers={"Retry-After": str(retry_after)},
        )

    # Аутентифицировать пользователя
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        audit_login_failed(form_data.username, client_ip)
        # Персистентный учёт неудач + авто-бан IP при переборе паролей
        ip_guard.record_login_failure(db, client_ip, form_data.username)
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    # Успешный вход — сбросить короткий rate-limit и записать успех в журнал
    # (счётчик брутфорса в ip_guard считается «с последнего успеха»)
    login_rate_limiter.reset(client_ip)
    ip_guard.record_login_success(db, client_ip, username=user.username)
    audit_login_success(user.id, user.username, client_ip)

    user.last_login = datetime.now(timezone.utc)
    db.commit()

    return _build_token_response(user)


@router.post("/refresh", response_model=Token)
async def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)):
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
            detail="Invalid or expired refresh token",
        )

    user_id = payload.get("user_id")
    username = payload.get("sub")

    if not user_id or not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload",
        )

    # Проверяем, что пользователь существует и активен
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    # Проверяем, что организация активна
    if user.organization_id and user.organization:
        if not user.organization.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Организация деактивирована",
            )

    # Проверяем что username совпадает (защита от переиспользования ID)
    if user.username != username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token mismatch"
        )

    # Создаём новую пару токенов (ротация)
    return _build_token_response(user)
