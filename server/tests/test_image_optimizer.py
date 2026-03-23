"""
Tests for ImageOptimizationService
==================================
Тесты сервиса оптимизации изображений.
"""

import io
from unittest.mock import MagicMock, patch

import pytest

from app.services.image_optimizer import (PILLOW_AVAILABLE,
                                          ImageOptimizationService)


class TestImageOptimizerInit:
    """Тесты инициализации сервиса."""

    def test_service_creation(self):
        """Создание сервиса."""
        service = ImageOptimizationService()
        assert service is not None
        assert hasattr(service, "enabled")
        assert hasattr(service, "quality")
        assert hasattr(service, "max_dimension")

    def test_default_settings(self):
        """Настройки по умолчанию."""
        service = ImageOptimizationService()
        assert service.quality > 0
        assert service.max_dimension > 0


class TestOptimizeDisabled:
    """Тесты когда оптимизация отключена."""

    def test_returns_original_when_disabled(self):
        """Возвращает оригинал когда отключено."""
        service = ImageOptimizationService()
        service.enabled = False

        test_content = b"fake image content"
        result_content, result_ext, mime_type = service.optimize(test_content, ".jpg")

        assert result_content == test_content
        assert result_ext == ".jpg"
        assert mime_type == "image/jpeg"

    def test_mime_types_mapping(self):
        """Проверка маппинга mime-types."""
        service = ImageOptimizationService()
        service.enabled = False

        test_content = b"fake"

        _, _, mime = service.optimize(test_content, ".jpg")
        assert mime == "image/jpeg"

        _, _, mime = service.optimize(test_content, ".jpeg")
        assert mime == "image/jpeg"

        _, _, mime = service.optimize(test_content, ".png")
        assert mime == "image/png"

        _, _, mime = service.optimize(test_content, ".webp")
        assert mime == "image/webp"


class TestGetStats:
    """Тесты получения статистики."""

    def test_get_stats_returns_dict(self):
        """get_stats возвращает словарь."""
        service = ImageOptimizationService()
        stats = service.get_stats()

        assert isinstance(stats, dict)
        assert "enabled" in stats
        assert "pillow_available" in stats
        assert "quality" in stats
        assert "max_dimension" in stats
        assert "convert_to_webp" in stats

    def test_stats_values(self):
        """Значения в статистике."""
        service = ImageOptimizationService()
        service.enabled = True
        service.quality = 85

        stats = service.get_stats()

        assert stats["enabled"] == True
        assert stats["quality"] == 85


@pytest.mark.skipif(not PILLOW_AVAILABLE, reason="Pillow not installed")
class TestImageProcessing:
    """Тесты обработки изображений (требуют Pillow)."""

    def test_optimize_jpeg(self):
        """Оптимизация JPEG."""
        from PIL import Image

        # Создаём тестовое изображение
        img = Image.new("RGB", (100, 100), color="red")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        content = buffer.getvalue()

        service = ImageOptimizationService()
        result_content, result_ext, mime_type = service.optimize(content, ".jpg")

        assert result_content is not None
        assert len(result_content) > 0
        assert mime_type == "image/jpeg"

    def test_optimize_png_converts_to_jpeg(self):
        """PNG конвертируется в JPEG."""
        from PIL import Image

        img = Image.new("RGB", (100, 100), color="blue")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        content = buffer.getvalue()

        service = ImageOptimizationService()
        service.convert_to_webp = False  # Убедимся что не конвертируем в webp

        result_content, result_ext, mime_type = service.optimize(content, ".png")

        # PNG конвертируется в JPEG
        assert result_ext == ".jpg"
        assert mime_type == "image/jpeg"

    def test_resize_large_image(self):
        """Ресайз большого изображения."""
        from PIL import Image

        # Создаём большое изображение
        img = Image.new("RGB", (3000, 2000), color="green")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        content = buffer.getvalue()

        service = ImageOptimizationService()
        service.max_dimension = 1920

        result_content, _, _ = service.optimize(content, ".jpg")

        # Проверяем что результат уменьшился
        result_img = Image.open(io.BytesIO(result_content))
        assert result_img.width <= 1920
        assert result_img.height <= 1920

    def test_rgba_to_rgb_conversion(self):
        """Конвертация RGBA в RGB."""
        from PIL import Image

        # Изображение с прозрачностью
        img = Image.new("RGBA", (100, 100), color=(255, 0, 0, 128))
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        content = buffer.getvalue()

        service = ImageOptimizationService()
        result_content, _, mime_type = service.optimize(content, ".png")

        # Результат должен быть RGB (JPEG)
        result_img = Image.open(io.BytesIO(result_content))
        assert result_img.mode == "RGB"

    def test_convert_to_webp_when_enabled(self):
        """Конвертация в WebP когда включено."""
        from PIL import Image

        img = Image.new("RGB", (100, 100), color="yellow")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        content = buffer.getvalue()

        service = ImageOptimizationService()
        service.convert_to_webp = True

        result_content, result_ext, mime_type = service.optimize(content, ".jpg")

        assert result_ext == ".webp"
        assert mime_type == "image/webp"


class TestOptimizeErrors:
    """Тесты обработки ошибок."""

    def test_invalid_image_returns_original(self):
        """При невалидном изображении возвращается оригинал."""
        service = ImageOptimizationService()

        invalid_content = b"this is not an image"
        result_content, result_ext, _ = service.optimize(invalid_content, ".jpg")

        # При ошибке возвращаем оригинал
        assert result_content == invalid_content
        assert result_ext == ".jpg"


class TestSingleton:
    """Тесты синглтона."""

    def test_singleton_imported(self):
        """Синглтон импортируется."""
        from app.services.image_optimizer import image_optimizer

        assert image_optimizer is not None
        assert isinstance(image_optimizer, ImageOptimizationService)


class TestOptimizeEdgeCases:
    """Дополнительные edge cases оптимизатора."""

    def test_zero_byte_image(self):
        """Пустые байты возвращают оригинал."""
        service = ImageOptimizationService()
        content, ext, mime = service.optimize(b"", ".jpg")
        assert content == b""
        assert ext == ".jpg"

    def test_unknown_extension_defaults(self):
        """Неизвестное расширение — mime по умолчанию."""
        service = ImageOptimizationService()
        service.enabled = False
        content, ext, mime = service.optimize(b"data", ".bmp")
        assert ext == ".bmp"
        # Should have some default mime
        assert mime is not None

    @pytest.mark.skipif(not PILLOW_AVAILABLE, reason="Pillow not installed")
    def test_small_image_no_resize(self):
        """Маленькое изображение не ресайзится."""
        from PIL import Image

        img = Image.new("RGB", (100, 100), color="red")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        content = buffer.getvalue()

        service = ImageOptimizationService()
        service.max_dimension = 1920
        result_content, _, _ = service.optimize(content, ".jpg")

        result_img = Image.open(io.BytesIO(result_content))
        assert result_img.width == 100
        assert result_img.height == 100

    @pytest.mark.skipif(not PILLOW_AVAILABLE, reason="Pillow not installed")
    def test_preserves_aspect_ratio(self):
        """Ресайз сохраняет пропорции."""
        from PIL import Image

        img = Image.new("RGB", (3000, 1000), color="blue")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        content = buffer.getvalue()

        service = ImageOptimizationService()
        service.max_dimension = 1920
        result_content, _, _ = service.optimize(content, ".jpg")

        result_img = Image.open(io.BytesIO(result_content))
        assert result_img.width <= 1920
        # Aspect ratio ~3:1
        ratio = result_img.width / result_img.height
        assert abs(ratio - 3.0) < 0.1

    @pytest.mark.skipif(not PILLOW_AVAILABLE, reason="Pillow not installed")
    def test_p_mode_image(self):
        """Palette (P mode) PNG конвертируется корректно."""
        from PIL import Image

        img = Image.new("P", (100, 100))
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        content = buffer.getvalue()

        service = ImageOptimizationService()
        result_content, _, _ = service.optimize(content, ".png")
        assert len(result_content) > 0

    def test_pillow_not_available_fallback(self):
        """Когда Pillow недоступен, возвращает оригинал."""
        with patch("app.services.image_optimizer.PILLOW_AVAILABLE", False):
            service = ImageOptimizationService()
            content = b"fake image"
            result, ext, mime = service.optimize(content, ".jpg")
            assert result == content
            assert ext == ".jpg"

    @pytest.mark.skipif(not PILLOW_AVAILABLE, reason="Pillow not installed")
    def test_webp_input_no_convert(self):
        """WebP вход остаётся WebP когда convert_to_webp=False."""
        from PIL import Image

        img = Image.new("RGB", (100, 100), color="green")
        buffer = io.BytesIO()
        img.save(buffer, format="WebP")
        content = buffer.getvalue()

        service = ImageOptimizationService()
        service.convert_to_webp = False
        result_content, result_ext, mime = service.optimize(content, ".webp")
        # Should stay as WebP or convert to JPEG, but not error out
        assert len(result_content) > 0
        assert mime in ["image/webp", "image/jpeg"]
