"""
Image Optimization Service
==========================
Сервис оптимизации изображений при загрузке.
Поддерживает ресайз, сжатие и конвертацию в WebP.
"""

import io
from pathlib import Path
from typing import Tuple, Optional

try:
    from PIL import Image
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False
    print("⚠️  Pillow не установлен. Сжатие изображений отключено.")
    print("   Установите: pip install Pillow")

from app.config import settings


class ImageOptimizationService:
    """
    Сервис оптимизации изображений.
    
    Возможности:
    - Ресайз до максимального размера (сохраняя пропорции)
    - Сжатие JPEG/WebP с настраиваемым качеством
    - Конвертация PNG -> JPEG (с белым фоном вместо прозрачности)
    - Опциональная конвертация в WebP
    
    Пример использования:
        service = ImageOptimizationService()
        optimized_content, new_ext, mime_type = service.optimize(
            content=raw_bytes,
            original_ext=".jpg"
        )
    """
    
    def __init__(self):
        self.enabled = getattr(settings, "IMAGE_OPTIMIZATION_ENABLED", True)
        self.quality = getattr(settings, "IMAGE_QUALITY", 85)
        self.max_dimension = getattr(settings, "IMAGE_MAX_DIMENSION", 1920)
        self.convert_to_webp = getattr(settings, "IMAGE_CONVERT_TO_WEBP", False)
        self.strip_metadata = getattr(settings, "IMAGE_STRIP_METADATA", True)
    
    def optimize(
        self,
        content: bytes,
        original_ext: str
    ) -> Tuple[bytes, str, str]:
        """
        Оптимизировать изображение.
        
        Args:
            content: Исходные байты изображения
            original_ext: Исходное расширение (.jpg, .png, .webp)
        
        Returns:
            Tuple[bytes, str, str]: (оптимизированные байты, новое расширение, mime-type)
        """
        # Если оптимизация отключена или Pillow недоступен
        if not self.enabled or not PILLOW_AVAILABLE:
            mime_types = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp"
            }
            return content, original_ext, mime_types.get(original_ext.lower(), "image/jpeg")
        
        try:
            return self._process_image(content, original_ext)
        except Exception as e:
            print(f"⚠️  Ошибка оптимизации изображения: {e}")
            # Возвращаем оригинал при ошибке
            mime_types = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg", 
                ".png": "image/png",
                ".webp": "image/webp"
            }
            return content, original_ext, mime_types.get(original_ext.lower(), "image/jpeg")
    
    def _process_image(
        self,
        content: bytes,
        original_ext: str
    ) -> Tuple[bytes, str, str]:
        """Внутренняя обработка изображения"""
        
        # Открываем изображение
        img = Image.open(io.BytesIO(content))
        original_size = len(content)
        
        # Конвертируем RGBA в RGB (для JPEG)
        if img.mode in ("RGBA", "P"):
            # Создаём белый фон
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[3] if len(img.split()) == 4 else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")
        
        # Ресайз если превышает максимальный размер
        width, height = img.size
        if width > self.max_dimension or height > self.max_dimension:
            ratio = min(self.max_dimension / width, self.max_dimension / height)
            new_size = (int(width * ratio), int(height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            print(f"📐 Ресайз: {width}x{height} -> {new_size[0]}x{new_size[1]}")
        
        # Определяем выходной формат
        if self.convert_to_webp:
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
        
        save_kwargs = {
            "quality": self.quality,
            "optimize": True
        }
        
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
            print(f"🗜️  Сжатие: {original_size // 1024} KB -> {new_size // 1024} KB (-{reduction:.1f}%)")
        else:
            print(f"📊 Размер: {new_size // 1024} KB (оптимизация не уменьшила)")
        
        return optimized_content, output_ext, mime_type
    
    def get_stats(self) -> dict:
        """Получить информацию о настройках"""
        return {
            "enabled": self.enabled,
            "pillow_available": PILLOW_AVAILABLE,
            "quality": self.quality,
            "max_dimension": self.max_dimension,
            "convert_to_webp": self.convert_to_webp,
            "strip_metadata": self.strip_metadata
        }


# Singleton экземпляр
image_optimizer = ImageOptimizationService()
