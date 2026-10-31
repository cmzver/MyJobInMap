"""Схемы реквизитов, документов и нормативов организации."""

from typing import Optional

from pydantic import BaseModel, Field


class SlaHours(BaseModel):
    """Норматив срока по приоритету, часы (не больше года)."""

    EMERGENCY: int = Field(..., ge=1, le=8760)
    URGENT: int = Field(..., ge=1, le=8760)
    CURRENT: int = Field(..., ge=1, le=8760)
    PLANNED: int = Field(..., ge=1, le=8760)


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
    repeat_window_days: int = Field(30, ge=1, le=365)


class OrganizationSettingsUpdate(OrganizationSettingsBase):
    # null — вернуть нормативы по умолчанию.
    sla_hours: Optional[SlaHours] = None


class OrganizationSettingsResponse(OrganizationSettingsBase):
    organization_id: int
    # Действующие нормативы: свои организации или по умолчанию.
    sla_hours: SlaHours
    sla_hours_customized: bool
