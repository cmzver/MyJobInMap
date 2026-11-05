"""Уведомления заявителю: страница статуса, Telegram и SMS.

Заявитель видит заявку по ссылке ``/portal/t/<токен>`` и может подписаться
на Telegram (``t.me/<бот>?start=<токен>``). SMS уходят на телефон заявки,
если у организации включены SMS и задан ключ SMS.ru: при приёме заявки
(со ссылкой на статус) и при выполнении. Отправка — через outbox после
коммита, так что сбой Telegram/SMS не ломает смену статуса.
"""

import asyncio
import hashlib
import hmac
import logging
import re
import secrets
from datetime import timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import OrganizationSettingsModel, TaskModel, TaskSubscriberModel
from app.services.business_time import business_tz
from app.services.outbox_service import stage_event

logger = logging.getLogger(__name__)
# httpx на INFO пишет URL запроса, а в URL Bot API — токен бота
logging.getLogger("httpx").setLevel(logging.WARNING)

TELEGRAM = "telegram"
# События, о которых сообщаем, и тексты (номер подставляется)
MESSAGES = {
    # Без текста заявки: его задаёт заявитель, а SMS уходит от имени организации
    "created": "Заявка {number} принята.",
    "planned": "Заявка {number}: мастер приедет {date}.",
    "IN_PROGRESS": "Заявка {number} в работе.",
    "DONE": "Заявка {number} выполнена.",
    "CANCELLED": "Заявка {number} отменена.",
}
# SMS платные — только самое важное
SMS_EVENTS = {"created", "DONE"}
_PHONE_DIGITS = re.compile(r"\D+")


class DeliveryError(Exception):
    """Временная ошибка доставки — outbox повторит."""


def ensure_token(db: Session, task: TaskModel) -> str:
    """Токен ссылки на статус; при гонке побеждает первый — ссылка не меняется."""
    if task.public_token:
        return task.public_token
    db.flush()
    db.query(TaskModel).filter(
        TaskModel.id == task.id, TaskModel.public_token.is_(None)
    ).update(
        {TaskModel.public_token: secrets.token_urlsafe(24)}, synchronize_session=False
    )
    db.refresh(task, ["public_token"])
    return task.public_token


def base_url(fallback: Optional[str] = None) -> Optional[str]:
    configured = (settings.PUBLIC_BASE_URL or "").strip().rstrip("/")
    return configured or (fallback or "").rstrip("/") or None


def status_url(token: str, fallback_base: Optional[str] = None) -> Optional[str]:
    base = base_url(fallback_base)
    return f"{base}/portal/t/{token}" if base else None


def telegram_link(token: str) -> Optional[str]:
    if not (settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_BOT_USERNAME):
        return None
    return f"https://t.me/{settings.TELEGRAM_BOT_USERNAME.lstrip('@')}?start={token}"


def telegram_enabled(db: Session, task: TaskModel) -> bool:
    """Подписка доступна: бот настроен на сервере и организация не выключила."""
    if not telegram_link("x"):
        return False
    org = (
        db.get(OrganizationSettingsModel, task.organization_id)
        if task.organization_id
        else None
    )
    return org is None or org.notify_telegram_enabled


def bot_secret() -> Optional[str]:
    """Секрет, которым бот подтверждает подписку: хеш токена бота."""
    token = settings.TELEGRAM_BOT_TOKEN
    return hashlib.sha256(token.encode()).hexdigest() if token else None


def check_bot_secret(value: Optional[str]) -> bool:
    expected = bot_secret()
    return bool(expected and value and hmac.compare_digest(expected, value))


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    """Российский мобильный 7XXXXXXXXXX или None."""
    digits = _PHONE_DIGITS.sub("", phone or "")
    if len(digits) == 11 and digits[0] in "78":
        digits = "7" + digits[1:]
    elif len(digits) == 10 and digits[0] == "9":
        digits = "7" + digits
    return digits if len(digits) == 11 and digits[1] == "9" else None


def _text(task: TaskModel, event: str) -> Optional[str]:
    template = MESSAGES.get(event)
    if template is None:
        return None
    date = ""
    if task.planned_date is not None:
        moment = task.planned_date
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
        date = moment.astimezone(business_tz()).strftime("%d.%m.%Y")
    return template.format(
        number=task.task_number or f"Z-{task.id:05d}",
        date=date,
    )


def notify(db: Session, task: TaskModel, event: str, sms: bool = True) -> None:
    """Поставить уведомления заявителю в outbox (без коммита)."""
    if task.organization_id is None:
        return
    if event == "planned" and task.planned_date is None:
        return
    text = _text(task, event)
    if text is None:
        return
    org = db.get(OrganizationSettingsModel, task.organization_id)
    telegram_on = org is None or org.notify_telegram_enabled
    sms_on = bool(org and org.sms_enabled and org.sms_api_id)

    if telegram_on and settings.TELEGRAM_BOT_TOKEN:
        chats = (
            db.query(TaskSubscriberModel.address)
            .filter_by(task_id=task.id, channel=TELEGRAM)
            .all()
        )
        url = status_url(task.public_token) if task.public_token else None
        for (chat_id,) in chats:
            stage_event(
                db,
                "telegram_send",
                {"chat_id": chat_id, "text": f"{text}\n{url}" if url else text},
                organization_id=task.organization_id,
            )

    phone = normalize_phone(task.customer_phone)
    if sms and sms_on and phone and event in SMS_EVENTS:
        message = text
        if event == "created":
            url = status_url(ensure_token(db, task))
            if url:
                message = f"{text} Статус: {url}"
        stage_event(
            db,
            "sms_send",
            {
                "organization_id": task.organization_id,
                "phone": phone,
                "text": message,
            },
            organization_id=task.organization_id,
        )


# ------------------------------------------------------------- доставка


async def send_telegram(chat_id: str, text: str) -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        )
    if response.status_code in (400, 403):
        # Чат удалён или бот заблокирован — повтор не поможет
        logger.info("Telegram %s: %s", chat_id, response.status_code)
        return
    if response.status_code >= 300:
        raise DeliveryError(f"Telegram HTTP {response.status_code}")


def _sms_api_id(organization_id: int) -> Optional[str]:
    from app.models.base import SessionLocal

    with SessionLocal() as db:
        row = db.get(OrganizationSettingsModel, organization_id)
        return row.sms_api_id if row and row.sms_enabled else None


async def send_sms(organization_id: int, phone: str, text: str) -> None:
    api_id = await asyncio.to_thread(_sms_api_id, organization_id)
    if not api_id:
        return  # SMS выключили, пока событие ждало отправки
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://sms.ru/sms/send",
                data={"api_id": api_id, "to": phone, "msg": text, "json": 1},
            )
    except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
        # До SMS.ru не дошли — повтор безопасен
        raise DeliveryError(f"SMS.ru недоступен: {type(exc).__name__}")
    except httpx.HTTPError as exc:
        # Запрос мог уйти и SMS — отправиться: повтор стоил бы второго платного SMS
        logger.warning(
            "SMS.ru: ответ не получен (%s), не повторяем", type(exc).__name__
        )
        return
    if response.status_code >= 500:
        logger.warning("SMS.ru HTTP %s, не повторяем", response.status_code)
        return
    try:
        data = response.json() if response.content else {}
    except ValueError:
        logger.warning("SMS.ru: неразборчивый ответ")
        return
    if data.get("status") != "OK":
        # Ошибки ключа/баланса/номера повтором не лечатся — в журнал
        logger.warning("SMS.ru: %s", data.get("status_text") or data)
