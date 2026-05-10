"""
Image Optimization Service
==========================
Сервис оптимизации изображений при загрузке.
Поддерживает ресайз, сжатие и конвертацию в WebP.

Настройки читаются из БД (SystemSettingModel), чтобы учитывались изменения
при обновлении параметров через админ-портал.
"""

import io
import logging
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

try:
    from PIL import Image

    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False
    logger.warning(
        "Pillow не установлен. Сжатие изображений отключено. Установите: pip install Pillow"
    )

from app.config import settings


class ImageOptimizationService:
    """
    Сервис оптимизации изображений.

    Возможности:
    - Ресайз до максимального размера (сохраняя пропорции)
    - Сжатие JPEG/WebP с настраиваемым качеством
    - Конвертация PNG -> JPEG (с белым фоном вместо прозрачности)
    - Опциональная конвертация в WebP

    ⚠️ ВАЖНО: Все настройки читаются из БД, поэтому требуется `db: Session` в методе `optimize()`

    Пример использования:
        from app.models import get_db
        db = next(get_db())
        optimized_content, new_ext, mime_type = service.optimize(
            content=raw_bytes,
            original_ext=".jpg",
            db=db
        )
    """

    def __init__(self):
        # Fallback значения из конфига для случаев когда БД недоступна
        self.enabled_default = getattr(settings, "IMAGE_OPTIMIZATION_ENABLED", True)
        self.quality_default = getattr(settings, "IMAGE_QUALITY", 85)
        self.max_dimension_default = getattr(settings, "IMAGE_MAX_DIMENSION", 1920)
        self.convert_to_webp_default = getattr(settings, "IMAGE_CONVERT_TO_WEBP", False)
        self.strip_metadata_default = getattr(settings, "IMAGE_STRIP_METADATA", True)

    def _get_settings_from_db(self, db: Optional[Session]) -> dict:
        """
        Получить настройки из БД. Если БД недоступна, использует fallback значения.
        """
        if db is None:
            return {
                "enabled": self.enabled_default,
                "quality": self.quality_default,
                "max_dimension": self.max_dimension_default,
                "convert_to_webp": self.convert_to_webp_default,
                "strip_metadata": self.strip_metadata_default,
            }

        try:
            from app.models import get_setting
            
            enabled = get_setting(db, "image_optimization_enabled", self.enabled_default)
            quality = get_setting(db, "image_quality", self.quality_default)
            max_dimension = get_setting(db, "image_max_dimension", self.max_dimension_default)
            convert_to_webp = get_setting(db, "image_convert_to_webp", self.convert_to_webp_default)
            strip_metadata = get_setting(db, "image_strip_metadata", self.strip_metadata_default)

            # Нормализуем типы
            if isinstance(enabled, str):
                enabled = enabled.lower() in ("true", "1", "yes")
            if isinstance(convert_to_webp, str):
                convert_to_webp = convert_to_webp.lower() in ("true", "1", "yes")
            
            quality = max(1, min(100, int(quality or self.quality_default)))
            max_dimension = max(1, int(max_dimension or self.max_dimension_default))

            return {
                "enabled": bool(enabled),
                "quality": quality,
                "max_dimension": max_dimension,
                "convert_to_webp": bool(convert_to_webp),
                "strip_metadata": bool(strip_metadata),
            }
        except Exception as e:
            logger.warning(f"Не удалось получить настройки из БД: {e}. Используются значения по умолчанию.")
            return {
                "enabled": self.enabled_default,
                "quality": self.quality_default,
                "max_dimension": self.max_dimension_default,
                "convert_to_webp": self.convert_to_webp_default,
                "strip_metadata": self.strip_metadata_default,
            }

    def optimize(self, content: bytes, original_ext: str, db: Optional[Session] = None) -> Tuple[bytes, str, str]:
        """
        Оптимизировать изображение.

        Args:
            content: Исходные байты изображения
            original_ext: Исходное расширение (.jpg, .png, .webp)
            db: Сессия БД для получения актуальных настроек (опционально)

        Returns:
            Tuple[bytes, str, str]: (оптимизированные байты, новое расширение, mime-type)
        """
        # Получаем актуальные настройки из БД
        settings_dict = self._get_settings_from_db(db)
        enabled = settings_dict["enabled"]
        
        # Если оптимизация отключена или Pillow недоступен
        if not enabled or not PILLOW_AVAILABLE:
            mime_types = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
            }
            return (
                content,
                original_ext,
                mime_types.get(original_ext.lower(), "image/jpeg"),
            )

        try:
            return self._process_image(content, original_ext, settings_dict)
        except Exception as e:
            logger.warning(f"Ошибка оптимизации изображения: {e}")
            # Возвращаем оригинал при ошибке
            mime_types = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
            }
            return (
                content,
                original_ext,
                mime_types.get(original_ext.lower(), "image/jpeg"),
            )

    def _process_image(
        self, content: bytes, original_ext: str, settings_dict: dict
    ) -> Tuple[bytes, str, str]:
        """Внутренняя обработка изображения с использованием параметров из settings_dict"""

        # Распаковываем параметры
        quality = settings_dict["quality"]
        max_dimension = settings_dict["max_dimension"]
        convert_to_webp = settings_dict["convert_to_webp"]

        # Открываем изображение
        img = Image.open(io.BytesIO(content))
        original_size = len(content)

        # Конвертируем RGBA в RGB (для JPEG)
        if img.mode in ("RGBA", "P"):
            # Создаём белый фон
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(
                img, mask=img.split()[3] if len(img.split()) == 4 else None
            )
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Ресайз если превышает максимальный размер
        width, height = img.size
        if width > max_dimension or height > max_dimension:
            ratio = min(max_dimension / width, max_dimension / height)
            new_size = (int(width * ratio), int(height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            logger.debug(f"Ресайз: {width}x{height} -> {new_size[0]}x{new_size[1]}")

        # Определяем выходной формат
        if convert_to_webp:
            output_format = "WEBP"
            output_ext = ".webp"
            mime_type = "image/webp"
        elif original_ext.lower() == ".png":
            # PNG конвертируем в JPEG для экономии места
            output_format = "JPEG"
            output_ext = ".jpg"
            mime_type = "image/jpeg"
        elif original_ext.lower() == ".webp":
            output_format = "WEBP"
            output_ext = ".webp"
            mime_type = "image/webp"
        else:
            output_format = "JPEG"
            output_ext = ".jpg"
            mime_type = "image/jpeg"

        # Сохраняем в буфер
        buffer = io.BytesIO()

        save_kwargs = {"quality": quality, "optimize": True}

        if output_format == "JPEG":
            save_kwargs["progressive"] = True

        if output_format == "WEBP":
            save_kwargs["method"] = 4  # Баланс скорости и сжатия

        img.save(buffer, format=output_format, **save_kwargs)
        optimized_content = buffer.getvalue()

        # Логируем результат
        new_size = len(optimized_content)
        reduction = ((original_size - new_size) / original_size) * 100

        if reduction > 0:
            logger.debug(
                f"Сжатие: {original_size // 1024} KB -> {new_size // 1024} KB (-{reduction:.1f}%)"
            )
        else:
            logger.debug(f"Размер: {new_size // 1024} KB (оптимизация не уменьшила)")

        return optimized_content, output_ext, mime_type

    def get_stats(self, db: Optional[Session] = None) -> dict:
        """Получить информацию о настройках из БД (или fallback значения)"""
        settings_dict = self._get_settings_from_db(db)
        return {
            "enabled": settings_dict["enabled"],
            "pillow_available": PILLOW_AVAILABLE,
            "quality": settings_dict["quality"],
            "max_dimension": settings_dict["max_dimension"],
            "convert_to_webp": settings_dict["convert_to_webp"],
            "strip_metadata": settings_dict["strip_metadata"],
        }


# Singleton экземпляр
image_optimizer = ImageOptimizationService()
