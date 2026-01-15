"""
Auth Schemas
============
Схемы для аутентификации и пользователей.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.models.enums import UserRole


class Token(BaseModel):
    """JWT токен"""
    access_token: str
    token_type: str
    user_id: int
    username: str
    role: str
    full_name: str


class TokenData(BaseModel):
    """Данные из токена"""
    username: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[str] = None


class UserCreate(BaseModel):
    """Создание пользователя"""
    username: str
    password: str
    full_name: str = ""
    email: Optional[str] = None
    phone: Optional[str] = None
    role: UserRole = UserRole.WORKER


class UserUpdate(BaseModel):
    """Обновление пользователя"""
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    """Ответ с данными пользователя"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    username: str
    full_name: str
    email: Optional[str]
    phone: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]
    assigned_tasks_count: int = 0


class PasswordChange(BaseModel):
    """Смена пароля"""
    old_password: str
    new_password: str


class UserStatsResponse(BaseModel):
    """Статистика пользователя"""
    user_id: int
    username: str
    full_name: str
    # Статистика по задачам
    total_tasks: int = 0
    completed_tasks: int = 0
    in_progress_tasks: int = 0
    new_tasks: int = 0
    # Финансовая статистика
    total_earnings: float = 0.0
    paid_tasks_count: int = 0
    remote_tasks_count: int = 0
    # По периодам
    completed_this_month: int = 0
    earnings_this_month: float = 0.0
    completed_this_week: int = 0
    earnings_this_week: float = 0.0


class ReportSettingsUpdate(BaseModel):
    """Настройки отправки отчётов"""
    report_target: str  # 'group', 'contact', 'none'
    report_contact_phone: Optional[str] = None


class ReportSettingsResponse(BaseModel):
    """Ответ с настройками отчётов"""
    report_target: str
    report_contact_phone: Optional[str]
