"""Доставка после коммита: аренда записи, повторы и сохранение ошибок.

Гарантия at-least-once: падение после внешней отправки допускает повтор.
Стабильный event_id позволяет клиентам дедуплицировать событие.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.base import SessionLocal
from app.models.outbox import OutboxEventModel
from app.services.task_queue import _resolve, raise_retryable_delivery_failure

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 10
_runner: asyncio.Task | None = None


def now_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def stage_event(
    db: Session,
    kind: str,
    payload: dict,
    *,
    key: str | None = None,
    organization_id=None,
):
    row = OutboxEventModel(
        event_key=key or str(uuid4()),
        kind=kind,
        payload=payload,
        organization_id=organization_id,
    )
    db.add(row)
    return row


def stage_notification(db, notification, external=False):
    from app.models import UserModel
    from app.services.notification_service import notification_broadcast_payload

    user = db.get(UserModel, notification.user_id)
    organization_id = user.organization_id if user else None
    user_id, event = notification_broadcast_payload(notification)
    event["event_id"] = f"notification:{notification.id}"
    stage_event(
        db,
        "notification",
        {"user_id": user_id, "event": event},
        key=f"notification:{notification.id}",
        organization_id=organization_id,
    )
    if external:
        stage_push(
            db,
            title=notification.title,
            body=notification.message,
            user_ids=[user_id],
            task_id=notification.task_id,
            notification_type=notification.type,
            event_id=f"notification:{notification.id}",
            organization_id=organization_id,
        )


def stage_push(
    db,
    *,
    title,
    body,
    user_ids,
    task_id=None,
    notification_type="task",
    url=None,
    event_id=None,
    organization_id=None,
    not_before=None,
):
    event_id = event_id or str(uuid4())
    extra = {"event_id": event_id}
    event = stage_event(
        db,
        "push_send",
        {
            "title": title,
            "body": body,
            "user_ids": user_ids,
            "task_id": task_id,
            "notification_type": notification_type,
            "extra_data": extra,
        },
        key=f"fcm:{event_id}",
        organization_id=organization_id,
    )
    if not_before is not None:
        event.available_at = not_before
    event = stage_event(
        db,
        "web_push_send",
        {
            "title": title,
            "body": body,
            "user_ids": user_ids,
            "url": url or (f"/tasks/{task_id}" if task_id else "/notifications"),
            "extra_data": extra,
        },
        key=f"web:{event_id}",
        organization_id=organization_id,
    )
    if not_before is not None:
        event.available_at = not_before


def stage_task_event(db, task, event_type="task_updated", user=None, **data):
    from app.services.websocket_manager import _event

    event = _event(
        event_type, {"task_id": task.id, "task_number": task.task_number or "", **data}
    )
    event["event_id"] = str(uuid4())
    stage_event(
        db,
        "task",
        {
            "event": event,
            "organization_id": task.organization_id,
            "exclude_user_id": user.id if user else None,
        },
        organization_id=task.organization_id,
    )


def claim_events(session_factory=SessionLocal, limit=10):
    now = now_utc()
    claimed = []
    with session_factory() as db:
        rows = (
            db.query(OutboxEventModel)
            .filter(
                OutboxEventModel.delivered_at.is_(None),
                OutboxEventModel.attempts < MAX_ATTEMPTS,
                OutboxEventModel.available_at <= now,
                or_(
                    OutboxEventModel.lease_until.is_(None),
                    OutboxEventModel.lease_until < now,
                ),
            )
            .order_by(OutboxEventModel.id)
            .with_for_update(skip_locked=True)
            .limit(limit)
            .all()
        )
        for row in rows:
            token = str(uuid4())
            changed = (
                db.query(OutboxEventModel)
                .filter(
                    OutboxEventModel.id == row.id,
                    OutboxEventModel.delivered_at.is_(None),
                    OutboxEventModel.attempts < MAX_ATTEMPTS,
                    OutboxEventModel.available_at <= now,
                    or_(
                        OutboxEventModel.lease_until.is_(None),
                        OutboxEventModel.lease_until < now,
                    ),
                )
                .update(
                    {"lease_token": token, "lease_until": now + timedelta(minutes=5)},
                    synchronize_session=False,
                )
            )
            if changed:
                claimed.append((row.id, token, row.kind, row.payload))
        db.commit()
    return claimed


def finish_event(event_id, token, error=None, session_factory=SessionLocal):
    with session_factory() as db:
        row = (
            db.query(OutboxEventModel).filter_by(id=event_id, lease_token=token).first()
        )
        if row is None:
            return
        row.lease_token = None
        row.lease_until = None
        row.attempts += 1
        if error is None:
            row.delivered_at = now_utc()
            row.last_error = None
        else:
            row.last_error = str(error)[:500]
            row.available_at = now_utc() + timedelta(
                seconds=min(3600, 2**row.attempts * 5)
            )
        db.commit()


async def dispatch_event(kind, payload):
    if kind == "task":
        from app.services.websocket_manager import ws_manager

        await ws_manager.broadcast(
            payload["event"],
            organization_id=payload["organization_id"],
            exclude_user_id=payload.get("exclude_user_id"),
        )
    elif kind == "notification":
        from app.services.notification_service import (
            broadcast_created_notification_async,
        )

        await broadcast_created_notification_async(payload["user_id"], payload["event"])
    elif kind == "telegram_send":
        from app.services.applicant_notify import send_telegram

        await send_telegram(**payload)
    elif kind == "sms_send":
        from app.services.applicant_notify import send_sms

        await send_sms(**payload)
    elif kind in {"push_send", "web_push_send"}:
        result = await asyncio.to_thread(_resolve(kind), **payload)
        raise_retryable_delivery_failure(result)
    else:
        raise ValueError(f"Неизвестный вид события: {kind}")


async def drain_outbox(session_factory=SessionLocal):
    events = await asyncio.to_thread(claim_events, session_factory)

    async def deliver_one(event):
        event_id, token, kind, payload = event
        error = None
        try:
            await dispatch_event(kind, payload)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            error = exc
            logger.warning("Outbox event %s: %s", event_id, type(exc).__name__)
        await asyncio.to_thread(finish_event, event_id, token, error, session_factory)

    await asyncio.gather(*(deliver_one(event) for event in events))
    return len(events)


async def _loop():
    while True:
        try:
            count = await drain_outbox()
        except asyncio.CancelledError:
            raise
        except Exception:
            count = 0
            logger.exception("Ошибка прохода outbox")
        await asyncio.sleep(1 if count else 5)


def start_outbox():
    global _runner
    _runner = asyncio.create_task(_loop())


async def stop_outbox():
    global _runner
    if _runner:
        _runner.cancel()
        try:
            await _runner
        except asyncio.CancelledError:
            pass
        _runner = None
