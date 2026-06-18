"""
Push Notification Service
=========================
Сервис отправки push-уведомлений через Firebase.
"""

import logging
import os
from typing import List, Optional

from app.config import settings
from app.services import metrics

logger = logging.getLogger(__name__)

# Firebase инициализация
firebase_app = None

ANDROID_CHANNEL_MAP = {
    "new_task": "fieldworker_tasks",
    "task_assigned": "fieldworker_tasks",
    "task_created": "fieldworker_tasks",
    "status_change": "fieldworker_status",
    "chat": "fieldworker_chat",
    "chat_message": "fieldworker_chat",
    "alert": "fieldworker_emergency",
    "emergency": "fieldworker_emergency",
}


def init_firebase() -> bool:
    """Инициализация Firebase Admin SDK"""
    global firebase_app

    if firebase_app is not None:
        return True

    creds_path = settings.FIREBASE_CREDENTIALS_PATH
    if not os.path.exists(creds_path):
        logger.warning(f"Firebase credentials not found at: {creds_path}")
        logger.warning("Push notifications will be disabled.")
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        cred = credentials.Certificate(creds_path)
        firebase_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase initialized successfully")
        return True
    except Exception as e:
        logger.warning(f"Firebase initialization failed: {e}")
        return False


def _send_push_sync(
    title: str,
    body: str,
    notification_type: str = "general",
    task_id: Optional[int] = None,
    user_ids: Optional[List[int]] = None,
    organization_id: Optional[int] = None,
    extra_data: Optional[dict] = None,
) -> dict:
    """Синхронная отправка push-уведомлений"""
    if firebase_app is None:
        logger.warning("Push: Firebase not configured")
        metrics.record_push_result("not_configured")
        return {"success": False, "message": "Firebase not configured"}

    from firebase_admin import messaging

    from app.models import DeviceModel, UserModel, get_db

    db = next(get_db())
    try:
        query = db.query(DeviceModel)
        if organization_id is not None:
            query = query.join(UserModel, DeviceModel.user_id == UserModel.id).filter(
                UserModel.organization_id == organization_id
            )
        if user_ids:
            query = query.filter(DeviceModel.user_id.in_(user_ids))

        devices = query.all()

        if not devices:
            logger.warning("Push: No devices found")
            metrics.record_push_result("no_devices")
            return {"success": False, "message": "No devices"}

        logger.info(f"Push: Sending to {len(devices)} device(s):")
        for d in devices:
            logger.info(
                f"   - ID:{d.id} User:{d.user_id} Device:{d.device_name} Token:{d.fcm_token[:20]}..."
            )

        tokens = [d.fcm_token for d in devices]

        android_channel_id = ANDROID_CHANNEL_MAP.get(
            notification_type, "fieldworker_tasks"
        )

        payload_data = {
            "type": notification_type,
            "task_id": str(task_id) if task_id else "",
            "title": title,
            "body": body,
            "channel_id": android_channel_id,
        }
        if extra_data:
            for k, v in extra_data.items():
                payload_data[k] = str(v)

        # Data-only message: no 'notification' field so that
        # onMessageReceived() is called even when the app is in
        # background/killed.  The Android client builds the
        # heads-up notification with sound itself.
        # NOTE: AndroidConfig.notification OMITTED intentionally —
        # including it causes Firebase to auto-display an empty
        # system notification alongside the one built by the app.
        message = messaging.MulticastMessage(
            data=payload_data,
            tokens=tokens,
            android=messaging.AndroidConfig(
                priority="high",
            ),
        )

        response = messaging.send_each_for_multicast(message)

        logger.info(
            f"Push: Sent={response.success_count}, Failed={response.failure_count}"
        )

        # Удаляем невалидные токены
        if response.failure_count > 0:
            for idx, send_response in enumerate(response.responses):
                if not send_response.success:
                    device = devices[idx]
                    error = send_response.exception
                    logger.warning(
                        f"Device {device.device_name} (ID:{device.id}): {error}"
                    )

                    if (
                        "not registered" in str(error).lower()
                        or "invalid" in str(error).lower()
                    ):
                        logger.info(f"Removing invalid token for device {device.id}")
                        db.delete(device)
                        db.commit()

        if response.success_count:
            metrics.record_push_result("success", response.success_count)
        if response.failure_count:
            metrics.record_push_result("failed", response.failure_count)

        return {
            "success": True,
            "sent": response.success_count,
            "failed": response.failure_count,
        }

    except Exception as e:
        logger.error(f"Push error: {e}")
        metrics.record_push_result("error")
        return {"success": False, "message": str(e)}
    finally:
        db.close()


def send_push_background(
    title: str,
    body: str,
    notification_type: str = "general",
    task_id: Optional[int] = None,
    user_ids: Optional[List[int]] = None,
    organization_id: Optional[int] = None,
    extra_data: Optional[dict] = None,
):
    """Поставить отправку push в фоновую очередь (не блокирует запрос).

    Делегирует task_queue: в режиме очереди уходит в ARQ/Redis (ретраи,
    видимость), иначе выполняется в daemon-потоке — прежнее поведение.
    """
    # Локальный импорт во избежание цикла (task_queue лениво грузит push).
    from app.services import task_queue

    task_queue.enqueue(
        "push_send",
        title=title,
        body=body,
        notification_type=notification_type,
        task_id=task_id,
        user_ids=user_ids,
        organization_id=organization_id,
        extra_data=extra_data,
    )
    logger.info(f"Push queued in background: {title}")


def send_push_notification(
    title: str,
    body: str,
    notification_type: str = "general",
    task_id: Optional[int] = None,
    user_ids: Optional[List[int]] = None,
    organization_id: Optional[int] = None,
    extra_data: Optional[dict] = None,
) -> dict:
    """Отправка push-уведомлений (асинхронно)"""
    send_push_background(
        title, body, notification_type, task_id, user_ids, organization_id, extra_data
    )
    return {"success": True, "message": "Push queued"}
