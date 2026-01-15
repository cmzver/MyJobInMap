"""
Configuration
=============
Централизованная конфигурация приложения.
Использует pydantic-settings для валидации и автоматической загрузки .env
"""

from pathlib import Path
from functools import lru_cache
from typing import Set

from pydantic import Field, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Настройки приложения.
    
    Значения загружаются из:
    1. Переменных окружения (приоритет)
    2. Файла .env (если существует)
    3. Значений по умолчанию
    """
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # Игнорировать неизвестные переменные в .env
    )
    
    # === База данных ===
    DATABASE_URL: str = Field(
        default="sqlite:///./tasks.db",
        description="URL подключения к БД (SQLite или PostgreSQL)"
    )
    
    # === JWT Аутентификация ===
    SECRET_KEY: str = Field(
        default="fieldworker-super-secret-key-change-in-production",
        description="Секретный ключ для JWT токенов (ОБЯЗАТЕЛЬНО сменить в production!)"
    )
    ALGORITHM: str = Field(default="HS256", description="Алгоритм подписи JWT")
    ACCESS_TOKEN_EXPIRE_HOURS: int = Field(default=24 * 7, description="Время жизни токена в часах")
    
    # === Firebase ===
    FIREBASE_CREDENTIALS: str = Field(
        default="firebase-service-account.json",
        description="Путь к файлу сервисного аккаунта Firebase"
    )
    
    # === Файлы ===
    MAX_FILE_SIZE: int = Field(default=5 * 1024 * 1024, description="Макс. размер файла (5 MB)")
    ALLOWED_EXTENSIONS: Set[str] = Field(
        default={".jpg", ".jpeg", ".png", ".webp"},
        description="Разрешённые расширения файлов"
    )
    
    # === Оптимизация изображений ===
    IMAGE_OPTIMIZATION_ENABLED: bool = Field(default=True, description="Включить оптимизацию")
    IMAGE_QUALITY: int = Field(default=85, ge=1, le=100, description="Качество JPEG (1-100)")
    IMAGE_MAX_DIMENSION: int = Field(default=1920, description="Макс. ширина/высота в пикселях")
    IMAGE_CONVERT_TO_WEBP: bool = Field(default=False, description="Конвертировать в WebP")
    IMAGE_STRIP_METADATA: bool = Field(default=True, description="Удалять EXIF метаданные")
    
    # === Геокодинг ===
    GEOCODING_TIMEOUT: int = Field(default=5, description="Таймаут геокодинга в секундах")
    GEOCODING_CACHE_SIZE: int = Field(default=1000, description="Размер кэша геокодинга")
    GEOCODING_USER_AGENT: str = Field(default="fieldworker_app", description="User-Agent для геокодера")
    
    # === Сервер ===
    HOST: str = Field(default="0.0.0.0", description="Хост для запуска сервера")
    PORT: int = Field(default=8001, ge=1, le=65535, description="Порт для запуска сервера")
    
    # === Логирование ===
    LOG_LEVEL: str = Field(default="INFO", description="Уровень логирования")
    LOG_FORMAT: str = Field(default="text", description="Формат логов (text/json)")
    
    # === API Метаданные ===
    API_VERSION: str = Field(default="2.4.2", description="Версия API")
    API_TITLE: str = Field(default="FieldWorker API", description="Название API")
    API_DESCRIPTION: str = Field(
        default="REST API для управления заявками выездных сотрудников",
        description="Описание API"
    )
    
    # === Вычисляемые пути (не из env) ===
    @computed_field
    @property
    def BASE_DIR(self) -> Path:
        """Корневая директория сервера"""
        return Path(__file__).resolve().parent.parent
    
    @computed_field
    @property
    def STATIC_DIR(self) -> Path:
        """Директория статических файлов"""
        return self.BASE_DIR / "static"
    
    @computed_field
    @property
    def UPLOADS_DIR(self) -> Path:
        """Директория загрузок"""
        return self.BASE_DIR / "uploads"
    
    @computed_field
    @property
    def PHOTOS_DIR(self) -> Path:
        """Директория фотографий"""
        return self.UPLOADS_DIR / "photos"
    
    @computed_field
    @property
    def PORTAL_DIR(self) -> Path:
        """Директория собранного портала"""
        return self.BASE_DIR.parent / "portal" / "dist"
    
    # === Вычисляемые свойства ===
    @computed_field
    @property
    def is_sqlite(self) -> bool:
        """Используется ли SQLite"""
        return self.DATABASE_URL.startswith("sqlite")
    
    @computed_field
    @property
    def is_postgres(self) -> bool:
        """Используется ли PostgreSQL"""
        return self.DATABASE_URL.startswith("postgresql") or self.DATABASE_URL.startswith("postgres")
    
    # Алиас для обратной совместимости
    @property
    def FIREBASE_CREDENTIALS_PATH(self) -> str:
        """Алиас для FIREBASE_CREDENTIALS (обратная совместимость)"""
        return self.FIREBASE_CREDENTIALS
    
    @model_validator(mode="after")
    def create_directories(self) -> "Settings":
        """Создаём необходимые директории при инициализации"""
        self.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
        return self


@lru_cache()
def get_settings() -> Settings:
    """Получить настройки (кэшируется)"""
    return Settings()


# Singleton для быстрого доступа
settings = get_settings()
