"""
Update Service
==============
Бизнес-логика обновлений Android-приложения: JSON-стор метаданных версий
в uploads/apk, валидация и приём APK, выбор последней версии. Роутер
app/api/updates.py — тонкий.

Хранилище — файловое (без БД): метаданные в updates.json, APK рядом.
Константы APK_DIR/METADATA_FILE остаются module-level (тесты их
подменяют через monkeypatch на временный каталог).
"""

import json
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.config import get_settings
from app.schemas.update import AppUpdateCheck, AppUpdateInfo
from app.services.apk_metadata import extract_apk_version_info

logger = logging.getLogger(__name__)

settings = get_settings()

# Директория для хранения APK файлов и метаданных
APK_DIR = settings.UPLOADS_DIR / "apk"
METADATA_FILE = APK_DIR / "updates.json"

# Максимальный размер APK — 100 МБ
MAX_APK_SIZE = 100 * 1024 * 1024

DOWNLOAD_URL = "/api/updates/download"


class UpdateServiceError(Exception):
    """Исключение операций с обновлениями."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


def _ensure_apk_dir() -> None:
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


def _save_metadata(records: list[dict]) -> None:
    """Сохранить метаданные обновлений в JSON файл."""
    _ensure_apk_dir()
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2, default=str)


def _get_latest_record() -> Optional[dict]:
    """Получить запись о последней версии."""
    records = _load_metadata()
    if not records:
        return None
    return max(records, key=lambda r: r["version_code"])


def _record_to_info(record: dict) -> AppUpdateInfo:
    return AppUpdateInfo(
        version_name=record["version_name"],
        version_code=record["version_code"],
        release_notes=record.get("release_notes", ""),
        is_mandatory=record.get("is_mandatory", False),
        file_size=record.get("file_size"),
        download_url=DOWNLOAD_URL,
        created_at=record["created_at"],
    )


class UpdateService:
    """Управление версиями APK поверх файлового JSON-стора."""

    def check_update(self, version_code: int, version_name: str) -> AppUpdateCheck:
        latest = _get_latest_record()
        if latest is None or latest["version_code"] <= version_code:
            return AppUpdateCheck(
                update_available=False,
                current_version=version_name or None,
            )
        return AppUpdateCheck(
            update_available=True,
            current_version=version_name or None,
            update=_record_to_info(latest),
        )

    def resolve_download(self) -> tuple[Path, str]:
        """Вернуть путь к последнему APK и имя для скачивания."""
        latest = _get_latest_record()
        if latest is None:
            raise UpdateServiceError("Нет доступных обновлений", 404)

        apk_path = APK_DIR / latest["filename"]
        if not apk_path.exists():
            raise UpdateServiceError("Файл APK не найден", 404)

        return apk_path, f"fieldworker-{latest['version_name']}.apk"

    def upload(
        self,
        *,
        content: bytes,
        filename: Optional[str],
        version_name: Optional[str],
        version_code: Optional[int],
        release_notes: str,
        is_mandatory: bool,
        actor_username: str,
    ) -> AppUpdateInfo:
        # Валидация файла
        if not filename or not filename.endswith(".apk"):
            raise UpdateServiceError("Файл должен быть в формате .apk", 400)

        if len(content) > MAX_APK_SIZE:
            raise UpdateServiceError(
                f"Размер файла превышает лимит ({MAX_APK_SIZE // 1024 // 1024} МБ)",
                400,
            )
        if len(content) == 0:
            raise UpdateServiceError("Файл пустой", 400)

        # Извлекаем фактическую версию из APK, чтобы исключить расхождение с формой.
        with tempfile.NamedTemporaryFile(suffix=".apk", delete=False) as temp_file:
            temp_file.write(content)
            temp_apk_path = Path(temp_file.name)

        try:
            extracted_version_name, extracted_version_code = extract_apk_version_info(
                temp_apk_path
            )
        except ValueError as exc:
            raise UpdateServiceError(
                f"Не удалось извлечь версию из APK: {exc}", 400
            ) from exc
        finally:
            temp_apk_path.unlink(missing_ok=True)

        if (
            version_name is not None
            and version_name.strip()
            and version_name.strip() != extracted_version_name
        ):
            raise UpdateServiceError(
                "version_name в форме не совпадает с AndroidManifest.xml "
                f"({version_name.strip()} != {extracted_version_name})",
                400,
            )

        if version_code is not None and version_code != extracted_version_code:
            raise UpdateServiceError(
                "version_code в форме не совпадает с AndroidManifest.xml "
                f"({version_code} != {extracted_version_code})",
                400,
            )

        # Проверяем, не существует ли версия с таким version_code
        records = _load_metadata()
        existing = next(
            (r for r in records if r["version_code"] == extracted_version_code), None
        )
        if existing:
            raise UpdateServiceError(
                f"Версия с кодом {extracted_version_code} уже существует "
                f"({existing['version_name']})",
                409,
            )

        latest = _get_latest_record()
        if latest is not None and extracted_version_code <= latest["version_code"]:
            raise UpdateServiceError(
                "version_code должен быть больше текущего максимального "
                f"({latest['version_code']})",
                409,
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
            actor_username,
        )

        return AppUpdateInfo(
            version_name=extracted_version_name,
            version_code=extracted_version_code,
            release_notes=release_notes,
            is_mandatory=is_mandatory,
            file_size=len(content),
            download_url=DOWNLOAD_URL,
            created_at=now,
        )

    def list_history(self) -> list[AppUpdateInfo]:
        records = _load_metadata()
        records.sort(key=lambda r: r["version_code"], reverse=True)
        return [_record_to_info(r) for r in records]

    def delete(self, version_code: int, actor_username: str) -> None:
        records = _load_metadata()
        record = next((r for r in records if r["version_code"] == version_code), None)
        if record is None:
            raise UpdateServiceError(f"Версия с кодом {version_code} не найдена", 404)

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
            actor_username,
        )


def get_update_service() -> UpdateService:
    return UpdateService()
