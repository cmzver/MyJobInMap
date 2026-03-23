"""
Update Schemas
==============
Схемы для системы обновления Android-приложения.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AppUpdateInfo(BaseModel):
    """Информация о доступном обновлении"""

    version_name: str = Field(description="Версия (например, '1.2.0')")
    version_code: int = Field(description="Числовой код версии")
    release_notes: str = Field(default="", description="Описание изменений")
    is_mandatory: bool = Field(default=False, description="Обязательное обновление")
    file_size: Optional[int] = Field(
        default=None, description="Размер APK файла в байтах"
    )
    download_url: str = Field(description="URL для скачивания APK")
    created_at: datetime = Field(description="Дата публикации")


class AppUpdateCheck(BaseModel):
    """Ответ на проверку обновления"""

    update_available: bool = Field(description="Доступно ли обновление")
    current_version: Optional[str] = Field(
        default=None, description="Текущая версия клиента"
    )
    update: Optional[AppUpdateInfo] = Field(
        default=None, description="Информация об обновлении"
    )


class AppUpdateUpload(BaseModel):
    """Данные при загрузке нового APK (из формы)"""

    version_name: str = Field(description="Версия (например, '1.2.0')")
    version_code: int = Field(description="Числовой код версии")
    release_notes: str = Field(default="", description="Описание изменений")
    is_mandatory: bool = Field(default=False, description="Обязательное обновление")


class AppUpdateRecord(BaseModel):
    """Запись об обновлении (хранение в JSON)"""

    version_name: str
    version_code: int
    release_notes: str = ""
    is_mandatory: bool = False
    filename: str
    file_size: int
    created_at: datetime
