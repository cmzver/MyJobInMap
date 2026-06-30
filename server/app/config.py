"""
Configuration
=============
Централизованная конфигурация приложения.
Использует pydantic-settings для валидации и автоматической загрузки .env
"""

import warnings
from functools import lru_cache
from pathlib import Path
from typing import List, Set

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
        description="URL подключения к БД (SQLite или PostgreSQL)",
    )

    # === JWT Аутентификация ===
    SECRET_KEY: str = Field(
        default="fieldworker-super-secret-key-change-in-production",
        description="Секретный ключ для JWT токенов (ОБЯЗАТЕЛЬНО сменить в production!)",
    )
    ALGORITHM: str = Field(default="HS256", description="Алгоритм подписи JWT")
    ACCESS_TOKEN_EXPIRE_HOURS: int = Field(
        default=24, description="Время жизни access токена в часах (24ч)"
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(
        default=30, description="Время жизни refresh токена в днях (30д)"
    )

    # === Firebase ===
    FIREBASE_CREDENTIALS: str = Field(
        default="firebase-service-account.json",
        description="Путь к файлу сервисного аккаунта Firebase",
    )

    # === Web Push (VAPID) ===
    # Браузерные push-уведомления (доставка при закрытой вкладке). Пара VAPID-
    # ключей генерируется один раз (`vapid --gen` / web-push generate-vapid-keys).
    # По умолчанию пусто → web push выключен (как Firebase без креденшелов).
    # Приватный ключ — секрет, только через env, не в репозиторий.
    VAPID_PUBLIC_KEY: str = Field(
        default="",
        description="VAPID public key (base64url, applicationServerKey для браузера)",
    )
    VAPID_PRIVATE_KEY: str = Field(
        default="",
        description="VAPID private key (PEM PKCS8). Секрет — только через env.",
    )
    VAPID_SUBJECT: str = Field(
        default="mailto:admin@example.com",
        description="VAPID subject (mailto: или https: контакт отправителя)",
    )

    # === Файлы ===
    MAX_FILE_SIZE: int = Field(
        default=5 * 1024 * 1024, description="Макс. размер файла (5 MB)"
    )
    ALLOWED_EXTENSIONS: Set[str] = Field(
        default={".jpg", ".jpeg", ".png", ".webp"},
        description="Разрешённые расширения файлов",
    )

    # === Оптимизация изображений ===
    IMAGE_OPTIMIZATION_ENABLED: bool = Field(
        default=True, description="Включить оптимизацию"
    )
    IMAGE_QUALITY: int = Field(
        default=85, ge=1, le=100, description="Качество JPEG (1-100)"
    )
    IMAGE_MAX_DIMENSION: int = Field(
        default=1920, description="Макс. ширина/высота в пикселях"
    )
    IMAGE_CONVERT_TO_WEBP: bool = Field(
        default=False, description="Конвертировать в WebP"
    )
    IMAGE_STRIP_METADATA: bool = Field(
        default=True, description="Удалять EXIF метаданные"
    )

    # === Геокодинг ===
    GEOCODING_TIMEOUT: int = Field(
        default=5, description="Таймаут геокодинга в секундах"
    )
    GEOCODING_CACHE_SIZE: int = Field(
        default=1000, description="Размер кэша геокодинга"
    )
    GEOCODING_USER_AGENT: str = Field(
        default="fieldworker_app", description="User-Agent для геокодера"
    )

    # === Rate Limiting ===
    RATE_LIMIT_MAX_ATTEMPTS: int = Field(
        default=5, ge=1, description="Макс. попыток логина на IP"
    )
    RATE_LIMIT_WINDOW_SECONDS: int = Field(
        default=60, ge=10, description="Окно rate limiting (сек)"
    )

    # === Защита от перебора / DDoS (IP guard) ===
    # За реверс-прокси (Caddy/nginx) реальный IP клиента приходит в заголовке
    # X-Forwarded-For / X-Real-IP, а request.client.host — это адрес прокси.
    # Включайте ТОЛЬКО когда сервер действительно стоит за доверенным прокси,
    # иначе клиент сможет подделать заголовок и обойти бан.
    TRUST_PROXY_HEADERS: bool = Field(
        default=False,
        description="Доверять X-Forwarded-For/X-Real-IP для определения IP клиента",
    )

    # === Автоматические бэкапы ===
    BACKUP_SCHEDULER_ENABLED: bool = Field(
        default=False, description="Включить встроенный планировщик бэкапов"
    )
    BACKUP_SCHEDULE_HOUR: int = Field(
        default=3, ge=0, le=23, description="Час запуска бэкапа (0-23)"
    )
    BACKUP_SCHEDULE_MINUTE: int = Field(
        default=0, ge=0, le=59, description="Минута запуска бэкапа (0-59)"
    )
    BACKUP_RETENTION_DAYS: int = Field(
        default=30, ge=1, description="Срок хранения бэкапов (дней)"
    )
    # Бэкап PostgreSQL: бинарники клиента (pg_dump/pg_restore). Если сервер
    # работает на хосте без установленного postgresql-client, а Postgres крутится
    # в Docker — задайте BACKUP_PG_DOCKER_CONTAINER, и дамп/restore будут
    # выполняться через `docker exec` внутри контейнера (там клиент есть).
    PG_DUMP_BIN: str = Field(default="pg_dump", description="Бинарник pg_dump")
    PG_RESTORE_BIN: str = Field(default="pg_restore", description="Бинарник pg_restore")
    BACKUP_PG_DOCKER_CONTAINER: str = Field(
        default="",
        description="Контейнер Postgres для запуска pg_dump/pg_restore через docker exec",
    )

    # === Фоновая очередь задач (ARQ + Redis) ===
    # Когда включено и доступен Redis, fire-and-forget задачи (push и т.п.)
    # кладутся в ARQ и выполняются отдельным worker-процессом (ретраи,
    # видимость). Когда выключено — задачи выполняются в daemon-потоке прямо в
    # процессе приложения (прежнее поведение, без зависимости от Redis).
    TASK_QUEUE_ENABLED: bool = Field(
        default=False,
        description="Класть фоновые задачи в ARQ/Redis вместо daemon-потока",
    )
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="URL брокера Redis для очереди задач ARQ",
    )

    # === Сервер ===
    HOST: str = Field(default="0.0.0.0", description="Хост для запуска сервера")
    PORT: int = Field(
        default=8001, ge=1, le=65535, description="Порт для запуска сервера"
    )
    ENVIRONMENT: str = Field(
        default="development", description="Окружение (development/production)"
    )

    # === CORS ===
    CORS_ORIGINS: List[str] = Field(
        default=["*"],
        description="Список разрешённых CORS origins (через запятую в .env)",
    )

    # === Логирование ===
    LOG_LEVEL: str = Field(default="INFO", description="Уровень логирования")
    LOG_FORMAT: str = Field(default="text", description="Формат логов (text/json)")

    # === API Метаданные ===
    API_VERSION: str = Field(default="2.18.0", description="Версия API")
    API_TITLE: str = Field(default="FieldWorker API", description="Название API")
    API_DESCRIPTION: str = Field(
        default="REST API для управления заявками выездных сотрудников",
        description="Описание API",
    )

    # === Beward intercom integration ===
    # Учётные данные панелей (общий аккаунт). НЕ хранятся в БД — только здесь.
    BEWARD_USER: str = Field(default="", description="Логин к веб-интерфейсу панелей")
    BEWARD_PASSWORD: str = Field(
        default="", description="Пароль к веб-интерфейсу панелей"
    )
    BEWARD_TIMEOUT: float = Field(
        default=10.0, description="Таймаут запроса к панели, сек"
    )
    BEWARD_SNAPSHOT_CACHE_TTL: float = Field(
        default=1.0, description="TTL кэша JPEG-кадра панели, сек (мягкий режим)"
    )
    # On-demand WireGuard: туннель поднимается только на время обращения к панели.
    BEWARD_WG_ENABLED: bool = Field(
        default=False,
        description="Поднимать WireGuard on-demand для доступа к панелям",
    )
    BEWARD_WG_CONF: str = Field(
        default="wg-intercom",
        description="Имя интерфейса или путь к .conf для wg-quick",
    )
    BEWARD_WG_LINGER: float = Field(
        default=45.0,
        description="Сколько держать туннель поднятым после последнего обращения, сек",
    )

    # === Вычисляемые пути (не из env) ===
    @computed_field
    @property
    def BASE_DIR(self) -> Path:
        """Корневая директория сервера"""
        return Path(__file__).resolve().parent.parent

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
        return self.DATABASE_URL.startswith(
            "postgresql"
        ) or self.DATABASE_URL.startswith("postgres")

    @computed_field
    @property
    def is_production(self) -> bool:
        """Производственное окружение"""
        return self.ENVIRONMENT.lower() == "production"

    # Алиас для обратной совместимости
    @property
    def FIREBASE_CREDENTIALS_PATH(self) -> str:
        """Алиас для FIREBASE_CREDENTIALS (обратная совместимость)"""
        return self.FIREBASE_CREDENTIALS

    @computed_field
    @property
    def web_push_enabled(self) -> bool:
        """Сконфигурирован ли web push (оба VAPID-ключа заданы)."""
        return bool(self.VAPID_PUBLIC_KEY and self.VAPID_PRIVATE_KEY)

    @model_validator(mode="after")
    def create_directories(self) -> "Settings":
        """Создаём необходимые директории и проверяем безопасность"""
        self.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

        # Предупреждение о дефолтном SECRET_KEY в production
        if (
            self.ENVIRONMENT.lower() == "production"
            and self.SECRET_KEY == "fieldworker-super-secret-key-change-in-production"
        ):
            warnings.warn(
                "⚠️  Используется дефолтный SECRET_KEY в production! "
                "Задайте SECRET_KEY в переменных окружения или .env файле!",
                RuntimeWarning,
                stacklevel=2,
            )
        return self


@lru_cache()
def get_settings() -> Settings:
    """Получить настройки (кэшируется)"""
    return Settings()


# Singleton для быстрого доступа
settings = get_settings()
