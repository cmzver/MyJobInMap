"""
Updates API
===========
API для управления обновлениями Android-приложения.

Endpoints:
- GET  /api/updates/check     — проверить наличие обновления (public для приложения)
- POST /api/updates/upload     — загрузить новый APK (admin only)
- GET  /api/updates/download   — скачать последний APK
- GET  /api/updates/history    — список всех версий (admin only)
- DELETE /api/updates/{version_code} — удалить версию (admin only)
"""

import json
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.user import UserModel
from app.schemas.update import AppUpdateCheck, AppUpdateInfo, AppUpdateRecord
from app.services.apk_metadata import extract_apk_version_info
from app.services.auth import get_current_superadmin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/updates", tags=["Updates"])

settings = get_settings()

# Директория для хранения APK файлов и метаданных
APK_DIR = settings.UPLOADS_DIR / "apk"
METADATA_FILE = APK_DIR / "updates.json"

# Максимальный размер APK — 100 МБ
MAX_APK_SIZE = 100 * 1024 * 1024


def _ensure_apk_dir():
    """Создать директорию для APK, если не существует."""
    APK_DIR.mkdir(parents=True, exist_ok=True)


def _load_metadata() -> list[dict]:
    """Загрузить метаданные обновлений из JSON файла."""
    if not METADATA_FILE.exists():
        return []
    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        logger.warning("Failed to load updates metadata, returning empty list")
        return []


def _save_metadata(records: list[dict]):
    """Сохранить метаданные обновлений в JSON файл."""
    _ensure_apk_dir()
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2, default=str)


def _get_latest_record() -> dict | None:
    """Получить запись о последней версии."""
    records = _load_metadata()
    if not records:
        return None
    return max(records, key=lambda r: r["version_code"])


@router.get("/check", response_model=AppUpdateCheck)
async def check_update(
    version_code: int = 0,
    version_name: str = "",
):
    """
    Проверить наличие обновления.
    
    Вызывается из Android-приложения.
    Не требует авторизации.
    
    Args:
        version_code: Текущий version_code приложения
        version_name: Текущая версия приложения (для отображения)
    """
    latest = _get_latest_record()
    
    if latest is None or latest["version_code"] <= version_code:
        return AppUpdateCheck(
            update_available=False,
            current_version=version_name or None,
        )
    
    apk_path = APK_DIR / latest["filename"]
    download_url = f"/api/updates/download"
    
    return AppUpdateCheck(
        update_available=True,
        current_version=version_name or None,
        update=AppUpdateInfo(
            version_name=latest["version_name"],
            version_code=latest["version_code"],
            release_notes=latest.get("release_notes", ""),
            is_mandatory=latest.get("is_mandatory", False),
            file_size=latest.get("file_size"),
            download_url=download_url,
            created_at=latest["created_at"],
        ),
    )


@router.get("/download")
async def download_latest_apk():
    """
    Скачать последнюю версию APK.
    
    Не требует авторизации (приложение скачивает без токена).
    """
    latest = _get_latest_record()
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Нет доступных обновлений",
        )
    
    apk_path = APK_DIR / latest["filename"]
    if not apk_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл APK не найден",
        )
    
    return FileResponse(
        path=str(apk_path),
        filename=f"fieldworker-{latest['version_name']}.apk",
        media_type="application/vnd.android.package-archive",
    )


@router.post("/upload", response_model=AppUpdateInfo, status_code=status.HTTP_201_CREATED)
async def upload_apk(
    file: UploadFile = File(..., description="APK файл"),
    version_name: str | None = Form(default=None, description="Версия из APK, опционально для валидации"),
    version_code: int | None = Form(default=None, description="Код версии из APK, опционально для валидации"),
    release_notes: str = Form(default="", description="Описание изменений"),
    is_mandatory: bool = Form(default=False, description="Обязательное обновление"),
    admin: UserModel = Depends(get_current_superadmin),
):
    """
    Загрузить новую версию APK.
    
    Только для администраторов.
    """
    # Валидация файла
    if not file.filename or not file.filename.endswith(".apk"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл должен быть в формате .apk",
        )
    
    # Проверяем размер
    content = await file.read()
    if len(content) > MAX_APK_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Размер файла превышает лимит ({MAX_APK_SIZE // 1024 // 1024} МБ)",
        )
    
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл пустой",
        )

    # Извлекаем фактическую версию из APK, чтобы исключить расхождение с формой.
    with tempfile.NamedTemporaryFile(suffix=".apk", delete=False) as temp_file:
        temp_file.write(content)
        temp_apk_path = Path(temp_file.name)

    try:
        extracted_version_name, extracted_version_code = extract_apk_version_info(temp_apk_path)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Не удалось извлечь версию из APK: {exc}",
        ) from exc
    finally:
        temp_apk_path.unlink(missing_ok=True)

    if version_name is not None and version_name.strip() and version_name.strip() != extracted_version_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "version_name в форме не совпадает с AndroidManifest.xml "
                f"({version_name.strip()} != {extracted_version_name})"
            ),
        )

    if version_code is not None and version_code != extracted_version_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "version_code в форме не совпадает с AndroidManifest.xml "
                f"({version_code} != {extracted_version_code})"
            ),
        )
    
    # Проверяем, не существует ли версия с таким version_code
    records = _load_metadata()
    existing = next((r for r in records if r["version_code"] == extracted_version_code), None)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Версия с кодом {extracted_version_code} уже существует "
                f"({existing['version_name']})"
            ),
        )

    latest = _get_latest_record()
    if latest is not None and extracted_version_code <= latest["version_code"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"version_code должен быть больше текущего максимального "
                f"({latest['version_code']})"
            ),
        )
    
    # Сохраняем APK файл
    _ensure_apk_dir()
    safe_filename = f"fieldworker-v{extracted_version_code}.apk"
    apk_path = APK_DIR / safe_filename
    
    with open(apk_path, "wb") as f:
        f.write(content)
    
    # Создаём запись
    now = datetime.now(timezone.utc)
    record = {
        "version_name": extracted_version_name,
        "version_code": extracted_version_code,
        "release_notes": release_notes,
        "is_mandatory": is_mandatory,
        "filename": safe_filename,
        "file_size": len(content),
        "created_at": now.isoformat(),
    }
    
    records.append(record)
    _save_metadata(records)
    
    logger.info(
        "APK uploaded: v%s (code %d), %d bytes, by %s",
        extracted_version_name,
        extracted_version_code,
        len(content),
        admin.username,
    )
    
    return AppUpdateInfo(
        version_name=extracted_version_name,
        version_code=extracted_version_code,
        release_notes=release_notes,
        is_mandatory=is_mandatory,
        file_size=len(content),
        download_url="/api/updates/download",
        created_at=now,
    )


@router.get("/history", response_model=list[AppUpdateInfo])
async def list_updates(
    admin: UserModel = Depends(get_current_superadmin),
):
    """
    Получить список всех загруженных версий.
    
    Только для администраторов. Отсортировано по version_code DESC.
    """
    records = _load_metadata()
    records.sort(key=lambda r: r["version_code"], reverse=True)
    
    return [
        AppUpdateInfo(
            version_name=r["version_name"],
            version_code=r["version_code"],
            release_notes=r.get("release_notes", ""),
            is_mandatory=r.get("is_mandatory", False),
            file_size=r.get("file_size"),
            download_url="/api/updates/download",
            created_at=r["created_at"],
        )
        for r in records
    ]


@router.delete("/{version_code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_update(
    version_code: int,
    admin: UserModel = Depends(get_current_superadmin),
):
    """
    Удалить версию обновления.
    
    Только для администраторов.
    """
    records = _load_metadata()
    record = next((r for r in records if r["version_code"] == version_code), None)
    
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Версия с кодом {version_code} не найдена",
        )
    
    # Удаляем APK файл
    apk_path = APK_DIR / record["filename"]
    if apk_path.exists():
        apk_path.unlink()
    
    # Удаляем запись
    records = [r for r in records if r["version_code"] != version_code]
    _save_metadata(records)
    
    logger.info(
        "APK deleted: v%s (code %d) by %s",
        record["version_name"],
        version_code,
        admin.username,
    )
