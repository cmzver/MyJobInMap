"""Схемы реквизитов, документов и нормативов организации."""

from typing import Optional

from pydantic import BaseModel, Field


class SlaHours(BaseModel):
    """Норматив срока по приоритету, часы (не больше года)."""

    EMERGENCY: int = Field(..., ge=1, le=8760)
    URGENT: int = Field(..., ge=1, le=8760)
    CURRENT: int = Field(..., ge=1, le=8760)
    PLANNED: int = Field(..., ge=1, le=8760)


DEFAULT_ACCEPTANCE_TEXT = (
    "Работы выполнены в полном объёме. Заказчик претензий по объёму, качеству "
    "и срокам выполнения работ не имеет."
)


class ActTemplate(BaseModel):
    """Бланк акта организации: что и как печатать.

    Копируется в снимок акта при выпуске — правка бланка не меняет уже
    выпущенные акты."""

    title: str = Field("Акт выполненных работ", min_length=1, max_length=120)
    accent_color: str = Field("#E65100", pattern=r"^#[0-9A-Fa-f]{6}$")
    contacts: Optional[str] = Field(
        None, max_length=300, description="Строка под реквизитами: телефон, сайт"
    )
    executor_label: str = Field("Исполнитель", min_length=1, max_length=40)
    customer_label: str = Field("Заказчик", min_length=1, max_length=40)
    acceptance_text: str = Field(
        DEFAULT_ACCEPTANCE_TEXT,
        min_length=1,
        max_length=1000,
        description="Печатается, если у заказчика нет претензий",
    )
    show_bank_details: bool = True
    show_prices: bool = True
    show_stamp_place: bool = True


class OrganizationSettingsBase(BaseModel):
    legal_name: Optional[str] = Field(None, max_length=300)
    inn: Optional[str] = Field(None, pattern=r"^(\d{10}|\d{12})$")
    kpp: Optional[str] = Field(None, pattern=r"^\d{9}$")
    ogrn: Optional[str] = Field(None, pattern=r"^(\d{13}|\d{15})$")
    legal_address: Optional[str] = Field(None, max_length=500)
    bank_name: Optional[str] = Field(None, max_length=200)
    bik: Optional[str] = Field(None, pattern=r"^\d{9}$")
    account: Optional[str] = Field(None, pattern=r"^\d{20}$")
    corr_account: Optional[str] = Field(None, pattern=r"^\d{20}$")
    director_name: Optional[str] = Field(None, max_length=200)
    director_title: Optional[str] = Field(None, max_length=100)
    act_number_prefix: str = Field("А", min_length=1, max_length=10)
    act_footer_text: Optional[str] = Field(None, max_length=2000)
    act_template: ActTemplate = Field(default_factory=ActTemplate)
    repeat_window_days: int = Field(30, ge=1, le=365)
    sla_escalations_enabled: bool = True
    # Уведомления заявителю: Telegram по подписке и SMS через SMS.ru
    notify_telegram_enabled: bool = True
    sms_enabled: bool = False


class OrganizationSettingsUpdate(OrganizationSettingsBase):
    # null — вернуть нормативы по умолчанию.
    sla_hours: Optional[SlaHours] = None
    # Ключ SMS.ru только записывается: null — не менять, "" — удалить
    sms_api_id: Optional[str] = Field(None, max_length=100)


class OrganizationSettingsResponse(OrganizationSettingsBase):
    organization_id: int
    # Действующие нормативы: свои организации или по умолчанию.
    sla_hours: SlaHours
    sla_hours_customized: bool
    has_act_logo: bool = False
    sms_configured: bool = False
    # Бот для подписки задан в окружении сервера
    telegram_available: bool = False
