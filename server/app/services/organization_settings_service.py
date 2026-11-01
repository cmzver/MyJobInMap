"""
Organization Settings Service
=============================
Реквизиты, бланк акта, нормативы сроков организации.

Строка в organization_settings создаётся при первом сохранении; до этого
действуют значения по умолчанию.
"""

import hashlib
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import OrganizationModel, OrganizationSettingsModel, UserModel
from app.schemas.organization_settings import (
    ActTemplate,
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
    SlaHours,
)
from app.services.sla_service import get_sla_hours_map

DEFAULT_ACT_NUMBER_PREFIX = "А"
LOGO_MAX_BYTES = 10 * 1024 * 1024
LOGO_MAX_SIZE = (800, 400)
# Что бы ни пришло, в бланк ложится наш PNG. Формат определяется по содержимому,
# не по имени файла: «logo.png» с сайта нередко оказывается WebP. EPS и PDF не
# берём — Pillow отдаёт их внешнему Ghostscript.
LOGO_FORMATS = frozenset({"PNG", "JPEG", "MPO", "WEBP", "GIF", "BMP", "TIFF", "AVIF"})

# Поля реквизитов и документов — всё, кроме нормативов и бланка.
_PLAIN_FIELDS = tuple(
    name
    for name in OrganizationSettingsUpdate.model_fields
    if name not in ("sla_hours", "act_template")
)


class OrganizationSettingsError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _ensure_organization(db: Session, organization_id: int) -> None:
    if db.get(OrganizationModel, organization_id) is None:
        raise OrganizationSettingsError("Организация не найдена", 404)


def act_template_of(row: Optional[OrganizationSettingsModel]) -> ActTemplate:
    """Бланк акта организации (по умолчанию, если не настроен)."""
    return ActTemplate(**(row.act_template or {})) if row else ActTemplate()


def get_organization_settings(
    db: Session, organization_id: int
) -> OrganizationSettingsResponse:
    _ensure_organization(db, organization_id)
    row = db.get(OrganizationSettingsModel, organization_id)
    values = {name: getattr(row, name) for name in _PLAIN_FIELDS} if row else {}
    hours = get_sla_hours_map(db, organization_id)
    return OrganizationSettingsResponse(
        organization_id=organization_id,
        **values,
        act_template=act_template_of(row),
        sla_hours=SlaHours(**{p: hours[p] for p in SlaHours.model_fields}),
        sla_hours_customized=bool(row and row.sla_hours),
        has_act_logo=bool(row and row.act_logo_file),
    )


def _row_for_update(db: Session, organization_id: int) -> OrganizationSettingsModel:
    _ensure_organization(db, organization_id)
    row = db.get(OrganizationSettingsModel, organization_id)
    if row is None:
        row = OrganizationSettingsModel(organization_id=organization_id)
        db.add(row)
    return row


def update_organization_settings(
    db: Session,
    organization_id: int,
    data: OrganizationSettingsUpdate,
    user: Optional[UserModel] = None,
) -> OrganizationSettingsResponse:
    """Сохранить настройки целиком. Сроки открытых заявок не пересчитываются:
    новые нормативы действуют для новых заявок и при следующей правке."""
    row = _row_for_update(db, organization_id)
    for name in _PLAIN_FIELDS:
        value = getattr(data, name)
        setattr(row, name, (value.strip() or None) if isinstance(value, str) else value)
    row.act_number_prefix = row.act_number_prefix or DEFAULT_ACT_NUMBER_PREFIX
    row.act_template = data.act_template.model_dump()
    row.sla_hours = data.sla_hours.model_dump() if data.sla_hours else None
    row.updated_by_id = user.id if user else None
    db.commit()
    return get_organization_settings(db, organization_id)


# ----------------------------------------------------------------- логотип


def logos_dir() -> Path:
    return settings.UPLOADS_DIR / "org-logos"


def logo_path(relative: Optional[str]) -> Optional[Path]:
    """Файл логотипа по пути из настроек или снимка акта (без выхода из каталога)."""
    if not relative:
        return None
    base = logos_dir().resolve()
    path = (base / relative).resolve()
    if base not in path.parents or not path.is_file():
        return None
    return path


def save_act_logo(
    db: Session,
    organization_id: int,
    content: bytes,
    user: Optional[UserModel] = None,
) -> OrganizationSettingsResponse:
    """Логотип для шапки акта: картинка до 10 МБ (PNG, JPG, WebP и другие
    растровые), хранится уменьшенным PNG."""
    if not content:
        raise OrganizationSettingsError("Файл пустой", 400)
    if len(content) > LOGO_MAX_BYTES:
        raise OrganizationSettingsError("Логотип больше 10 МБ", 413)
    if b"<svg" in content[:1024]:
        raise OrganizationSettingsError(
            "SVG не подходит — сохраните логотип как PNG или JPG", 415
        )
    try:
        with Image.open(BytesIO(content)) as probe:
            # Формат — до любой обработки: неподходящий файл не декодируем
            if probe.format not in LOGO_FORMATS:
                raise OrganizationSettingsError(
                    f"Формат {probe.format} не подходит — сохраните логотип "
                    "как PNG или JPG",
                    415,
                )
            probe.verify()
        with Image.open(BytesIO(content)) as image:
            # Фото логотипа с телефона — с поворотом из EXIF
            logo = ImageOps.exif_transpose(image).convert("RGBA")
            logo.thumbnail(LOGO_MAX_SIZE)
            buffer = BytesIO()
            logo.save(buffer, format="PNG", optimize=True)
    except Image.DecompressionBombError:
        raise OrganizationSettingsError("Картинка слишком большая — уменьшите её", 413)
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        # Битый PNG Pillow отвергает SyntaxError
        raise OrganizationSettingsError(
            "Не удалось прочитать картинку — подойдут PNG, JPG или WebP", 415
        )

    png = buffer.getvalue()
    relative = f"{organization_id}/{hashlib.sha256(png).hexdigest()[:16]}.png"
    target = logos_dir() / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(png)

    row = _row_for_update(db, organization_id)
    row.act_logo_file = relative
    row.updated_by_id = user.id if user else None
    db.commit()
    return get_organization_settings(db, organization_id)


def remove_act_logo(
    db: Session, organization_id: int, user: Optional[UserModel] = None
) -> OrganizationSettingsResponse:
    """Убрать логотип из бланка. Файл остаётся — на него ссылаются выпущенные акты."""
    row = _row_for_update(db, organization_id)
    row.act_logo_file = None
    row.updated_by_id = user.id if user else None
    db.commit()
    return get_organization_settings(db, organization_id)
