"""Страница статуса заявки для заявителя и подписка на Telegram.

Публично, по токену ссылки: номер, адрес, статус и его история, плановая
дата, оформленные акты. Без ФИО, телефонов, исполнителя и внутренних
комментариев. Подписку оформляет бот (``/start <токен>``), подтверждая себя
секретом ``X-Bot-Secret``.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import TaskAccess, require_task_access
from app.models import (
    ActModel,
    CommentModel,
    OrganizationModel,
    TaskModel,
    TaskSubscriberModel,
    get_db,
)
from app.schemas.datetime_utc import UtcDateTime
from app.services import applicant_notify
from app.services.act_service import CANCELLED
from app.services.public_url import public_base_url
from app.utils import get_status_display_name

router = APIRouter(prefix="/api/public/tasks", tags=["Public tasks"])
staff_router = APIRouter(prefix="/api/tasks", tags=["Tasks"])

TOKEN_PATTERN = r"^[A-Za-z0-9_-]{16,64}$"


class PublicTaskEvent(BaseModel):
    at: UtcDateTime
    text: str


class PublicTaskAct(BaseModel):
    number: str
    status: str
    created_at: Optional[UtcDateTime] = None


class PublicTaskView(BaseModel):
    number: str
    title: str
    address: str
    status: str
    status_label: str
    created_at: Optional[UtcDateTime] = None
    planned_date: Optional[UtcDateTime] = None
    completed_at: Optional[UtcDateTime] = None
    events: List[PublicTaskEvent]
    acts: List[PublicTaskAct]
    organization: Optional[str] = None
    organization_phone: Optional[str] = None
    # Ссылка подписки на Telegram; нет — уведомления в Telegram недоступны
    telegram_url: Optional[str] = None


class TaskStatusLink(BaseModel):
    token: str
    url: str
    telegram_url: Optional[str] = None
    subscribers: int = 0


class TelegramSubscribe(BaseModel):
    code: str = Field(pattern=TOKEN_PATTERN)
    chat_id: str = Field(pattern=r"^-?\d{1,20}$")


class TelegramUnsubscribe(BaseModel):
    chat_id: str = Field(pattern=r"^-?\d{1,20}$")


class TelegramSubscribed(BaseModel):
    number: str
    status_label: str
    url: Optional[str] = None


def _task_by_token(db: Session, token: str) -> TaskModel:
    task = None
    if 16 <= len(token) <= 64:
        task = db.query(TaskModel).filter(TaskModel.public_token == token).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Ссылка недействительна")
    return task


def _number(task: TaskModel) -> str:
    return task.task_number or f"Z-{task.id:05d}"


def _require_bot(secret: Optional[str]) -> None:
    if not applicant_notify.check_bot_secret(secret):
        raise HTTPException(status_code=403, detail="Только для бота")


def _telegram_enabled(db: Session, task: TaskModel) -> bool:
    from app.models import OrganizationSettingsModel

    org = (
        db.get(OrganizationSettingsModel, task.organization_id)
        if task.organization_id
        else None
    )
    return org is None or org.notify_telegram_enabled


# Подписка объявлена раньше /{token}: иначе «telegram» сошёл бы за токен


@router.post("/telegram/subscribe", response_model=TelegramSubscribed)
def telegram_subscribe(
    data: TelegramSubscribe,
    x_bot_secret: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_bot(x_bot_secret)
    task = _task_by_token(db, data.code)
    if not _telegram_enabled(db, task):
        raise HTTPException(status_code=409, detail="Уведомления в Telegram отключены")
    exists = (
        db.query(TaskSubscriberModel.id)
        .filter_by(
            task_id=task.id, channel=applicant_notify.TELEGRAM, address=data.chat_id
        )
        .first()
    )
    if exists is None:
        db.add(
            TaskSubscriberModel(
                task_id=task.id,
                channel=applicant_notify.TELEGRAM,
                address=data.chat_id,
            )
        )
        db.commit()
    return TelegramSubscribed(
        number=_number(task),
        status_label=get_status_display_name(task.status),
        url=applicant_notify.status_url(task.public_token),
    )


@router.post("/telegram/unsubscribe", status_code=204)
def telegram_unsubscribe(
    data: TelegramUnsubscribe,
    x_bot_secret: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Отписать чат от всех заявок (команда /stop в боте)."""
    _require_bot(x_bot_secret)
    db.query(TaskSubscriberModel).filter_by(
        channel=applicant_notify.TELEGRAM, address=data.chat_id
    ).delete(synchronize_session=False)
    db.commit()


@router.get("/{token}", response_model=PublicTaskView)
def public_task(token: str, db: Session = Depends(get_db)):
    task = _task_by_token(db, token)
    events = [PublicTaskEvent(at=task.created_at, text="Заявка принята")]
    for change in (
        db.query(CommentModel)
        .filter(CommentModel.task_id == task.id, CommentModel.new_status.isnot(None))
        .order_by(CommentModel.created_at, CommentModel.id)
    ):
        if change.new_status != change.old_status:
            events.append(
                PublicTaskEvent(
                    at=change.created_at,
                    text=get_status_display_name(change.new_status),
                )
            )
    acts = (
        db.query(ActModel)
        .filter(ActModel.task_id == task.id, ActModel.status != CANCELLED)
        .order_by(ActModel.created_at)
        .all()
    )
    organization = (
        db.get(OrganizationModel, task.organization_id)
        if task.organization_id
        else None
    )
    return PublicTaskView(
        number=_number(task),
        title=task.title,
        address=task.raw_address,
        status=task.status,
        status_label=get_status_display_name(task.status),
        created_at=task.created_at,
        planned_date=task.planned_date,
        completed_at=task.completed_at,
        events=events,
        acts=[
            PublicTaskAct(
                number=act.number, status=act.status, created_at=act.created_at
            )
            for act in acts
        ],
        organization=organization.name if organization else None,
        organization_phone=organization.phone if organization else None,
        telegram_url=(
            applicant_notify.telegram_link(token)
            if _telegram_enabled(db, task)
            else None
        ),
    )


@staff_router.post("/{task_id}/status-link", response_model=TaskStatusLink)
def task_status_link(
    request: Request,
    access: TaskAccess = Depends(require_task_access("view_tasks")),
    db: Session = Depends(get_db),
):
    """Ссылка заявителю на статус заявки: одна и та же при повторных запросах."""
    task = access.task
    token = applicant_notify.ensure_token(task)
    db.commit()
    subscribers = db.query(TaskSubscriberModel.id).filter_by(task_id=task.id).count()
    return TaskStatusLink(
        token=token,
        url=applicant_notify.status_url(token, public_base_url(request)),
        telegram_url=(
            applicant_notify.telegram_link(token)
            if _telegram_enabled(db, task)
            else None
        ),
        subscribers=subscribers,
    )


__all__ = ["router", "staff_router"]
