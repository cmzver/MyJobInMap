"""
Web Push Service (VAPID)
========================
Браузерные push-уведомления портала (Push API) при закрытой вкладке.
Отдельно от Firebase/FCM ([push.py], Android): здесь — подписки браузеров,
хранящиеся в ``push_subscriptions``, доставка через ``pywebpush`` + VAPID.

По умолчанию (нет VAPID-ключей в конфиге) сервис — no-op, как Firebase без
креденшелов.
"""

import json
import logging
from typing import List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Лениво построенный VAPID-инстанс (повторное использование между отправками).
_vapid = None
_vapid_failed = False


def _get_vapid():
    """Vapid01-инстанс из приватного ключа конфига (или None, если не настроен)."""
    global _vapid, _vapid_failed
    if _vapid is not None or _vapid_failed:
        return _vapid
    if not settings.web_push_enabled:
        _vapid_failed = True
        return None
    try:
        from py_vapid import Vapid01

        # В .env приватный PEM хранится одной строкой с экранированными \n.
        pem = settings.VAPID_PRIVATE_KEY.replace("\\n", "\n")
        _vapid = Vapid01.from_pem(pem.encode())
        return _vapid
    except Exception as exc:  # некорректный ключ — выключаем web push
        _vapid_failed = True
        logger.warning("Web push: не удалось загрузить VAPID-ключ: %s", exc)
        return None


def _send_web_push_sync(
    title: str,
    body: str,
    url: str = "/chat",
    user_ids: Optional[List[int]] = None,
    extra_data: Optional[dict] = None,
) -> dict:
    """Синхронная отправка web-push подписчикам из ``user_ids``.

    Доставляет каждому активному endpoint'у; протухшие подписки (404/410)
    удаляет из БД. Возвращает счётчики для метрик/логов.
    """
    vapid = _get_vapid()
    if vapid is None:
        logger.debug("Web push: VAPID не настроен — пропуск")
        return {"success": False, "message": "Web push not configured"}
    if not user_ids:
        return {"success": False, "message": "No recipients"}

    from pywebpush import WebPushException, webpush

    from app.models import PushSubscriptionModel, get_db

    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "url": url,
            **(extra_data or {}),
        }
    )

    db = next(get_db())
    sent = 0
    failed = 0
    try:
        subs = (
            db.query(PushSubscriptionModel)
            .filter(PushSubscriptionModel.user_id.in_(user_ids))
            .all()
        )
        if not subs:
            return {"success": False, "message": "No subscriptions"}

        stale_ids: list[int] = []
        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=vapid,
                    vapid_claims={"sub": settings.VAPID_SUBJECT},
                    ttl=600,
                )
                sent += 1
            except WebPushException as exc:
                failed += 1
                status = getattr(getattr(exc, "response", None), "status_code", None)
                # 404/410 — подписка протухла, удаляем; прочее — временный сбой.
                if status in (404, 410):
                    stale_ids.append(sub.id)
                else:
                    logger.warning(
                        "Web push: сбой доставки (sub=%s, status=%s): %s",
                        sub.id,
                        status,
                        exc,
                    )

        if stale_ids:
            db.query(PushSubscriptionModel).filter(
                PushSubscriptionModel.id.in_(stale_ids)
            ).delete(synchronize_session=False)
            db.commit()
            logger.info("Web push: удалено протухших подписок: %d", len(stale_ids))

        return {"success": True, "sent": sent, "failed": failed}
    except Exception as exc:
        logger.error("Web push error: %s", exc)
        return {"success": False, "message": str(exc)}
    finally:
        db.close()


def send_web_push(
    title: str,
    body: str,
    url: str = "/chat",
    user_ids: Optional[List[int]] = None,
    extra_data: Optional[dict] = None,
) -> dict:
    """Поставить web-push в фоновую очередь (не блокирует запрос)."""
    if not settings.web_push_enabled:
        return {"success": False, "message": "Web push not configured"}

    from app.services import task_queue

    task_queue.enqueue(
        "web_push_send",
        title=title,
        body=body,
        url=url,
        user_ids=user_ids,
        extra_data=extra_data,
    )
    return {"success": True, "message": "Web push queued"}
