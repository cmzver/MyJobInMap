"""
Web Push API
============
Подписка/отписка браузера на push-уведомления (Push API / VAPID) и выдача
публичного VAPID-ключа клиенту. Подписки хранятся в ``push_subscriptions``.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.models import PushSubscriptionModel, UserModel, get_db
from app.services import get_current_user_required

router = APIRouter(prefix="/api/push", tags=["Push"])

logger = logging.getLogger(__name__)


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionPayload(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribePayload(BaseModel):
    endpoint: str


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Публичный VAPID-ключ для подписки браузера (applicationServerKey)."""
    return {
        "public_key": settings.VAPID_PUBLIC_KEY,
        "enabled": settings.web_push_enabled,
    }


@router.post("/subscribe")
async def subscribe(
    payload: PushSubscriptionPayload,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user_required),
):
    """Сохранить (или обновить) push-подписку текущего пользователя."""
    user_agent: Optional[str] = request.headers.get("user-agent")
    if user_agent:
        user_agent = user_agent[:255]

    existing = (
        db.query(PushSubscriptionModel)
        .filter(PushSubscriptionModel.endpoint == payload.endpoint)
        .first()
    )
    if existing:
        # Тот же браузерный endpoint мог сменить владельца/ключи — обновляем.
        existing.user_id = current_user.id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        existing.user_agent = user_agent
        db.commit()
        return {"success": True, "id": existing.id}

    sub = PushSubscriptionModel(
        user_id=current_user.id,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_agent=user_agent,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return {"success": True, "id": sub.id}


@router.post("/unsubscribe")
async def unsubscribe(
    payload: PushUnsubscribePayload,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user_required),
):
    """Удалить push-подписку текущего пользователя по endpoint."""
    db.query(PushSubscriptionModel).filter(
        PushSubscriptionModel.endpoint == payload.endpoint,
        PushSubscriptionModel.user_id == current_user.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True}
