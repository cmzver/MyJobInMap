"""
Auth API — account
==================
Самообслуживание учётной записи: профиль, аватар, смена пароля,
настройки отчётов, разрешения и публичная отдача аватаров.
"""

from pathlib import Path
from typing import Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.models import RolePermissionModel, UserModel, get_db, init_default_settings
from app.schemas import ReportSettingsResponse, ReportSettingsUpdate, UserResponse
from app.services import (
    get_current_user_required,
    get_password_hash,
    image_optimizer,
    verify_password,
)
from app.services.role_utils import canonical_role_value, public_role_value
from app.utils import user_to_response

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


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    data: ProfileUpdate,
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
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
        raise HTTPException(
            status_code=400, detail="Размер файла не должен превышать 5 МБ"
        )

    extension = Path(avatar.filename or "avatar").suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(
            status_code=400, detail="Поддерживаются JPG, PNG, WEBP и GIF"
        )

    # Сжатие/ресайз через общий image_optimizer (как для фото заявок).
    # GIF не оптимизируется (Pillow выдал бы первый кадр) — сохраняем как есть.
    if extension != ".gif":
        content, extension, _ = image_optimizer.optimize(content, extension, db)

    avatar_dir = settings.UPLOADS_DIR / "avatars" / str(user.id)
    avatar_dir.mkdir(parents=True, exist_ok=True)

    if user.avatar_path:
        old_path = (settings.UPLOADS_DIR / user.avatar_path).resolve()
        avatars_root = (settings.UPLOADS_DIR / "avatars").resolve()
        if (
            avatars_root in old_path.parents
            and old_path.exists()
            and old_path.is_file()
        ):
            old_path.unlink(missing_ok=True)

    file_name = f"{uuid4().hex}{extension}"
    relative_path = Path("avatars") / str(user.id) / file_name
    destination = settings.UPLOADS_DIR / relative_path
    destination.write_bytes(content)

    user.avatar_path = relative_path.as_posix()
    db.commit()
    db.refresh(user)

    return user_to_response(user)


@router.patch("/password")
async def change_password(
    data: PasswordChange,
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Изменить пароль текущего пользователя"""
    # Проверка текущего пароля
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")

    # Валидация нового пароля
    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=400, detail="Пароль должен быть не менее 6 символов"
        )

    # Обновление пароля
    user.password_hash = get_password_hash(data.new_password)
    db.commit()

    return {"success": True, "message": "Пароль успешно изменён"}


@router.get("/report-settings", response_model=ReportSettingsResponse)
async def get_report_settings(
    user: UserModel = Depends(get_current_user_required), db: Session = Depends(get_db)
):
    """Получить настройки отправки отчётов"""
    return ReportSettingsResponse(
        report_target=user.report_target or "group",
        report_contact_phone=user.report_contact_phone,
    )


@router.get("/permissions", response_model=PermissionsResponse)
async def get_my_permissions(
    user: UserModel = Depends(get_current_user_required), db: Session = Depends(get_db)
):
    """Получить разрешения текущего пользователя"""
    init_default_settings(db)
    perms = (
        db.query(RolePermissionModel)
        .filter(RolePermissionModel.role == canonical_role_value(user.role))
        .all()
    )
    permissions = {perm.permission: perm.is_allowed for perm in perms}
    return PermissionsResponse(
        role=public_role_value(user.role, user.organization_id),
        permissions=permissions,
    )


@router.patch("/report-settings", response_model=ReportSettingsResponse)
async def update_report_settings(
    settings: ReportSettingsUpdate,
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Обновить настройки отправки отчётов"""
    if settings.report_target not in ("group", "contact", "none"):
        raise HTTPException(status_code=400, detail="Invalid report_target")

    if settings.report_target == "contact" and not settings.report_contact_phone:
        raise HTTPException(
            status_code=400, detail="Phone required for 'contact' target"
        )

    user.report_target = settings.report_target
    user.report_contact_phone = settings.report_contact_phone

    db.commit()
    db.refresh(user)

    return ReportSettingsResponse(
        report_target=user.report_target,
        report_contact_phone=user.report_contact_phone,
    )
