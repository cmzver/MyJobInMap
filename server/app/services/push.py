"""
Push Notification Service
=========================
Сервис отправки push-уведомлений через Firebase.
"""

import logging
import os
import threading
from typing import List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Firebase инициализация
firebase_app = None


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
            return {"success": False, "message": "No devices"}

        logger.info(f"Push: Sending to {len(devices)} device(s):")
        for d in devices:
            logger.info(
                f"   - ID:{d.id} User:{d.user_id} Device:{d.device_name} Token:{d.fcm_token[:20]}..."
            )

        tokens = [d.fcm_token for d in devices]

        payload_data = {
            "type": notification_type,
            "task_id": str(task_id) if task_id else "",
        }
        if extra_data:
            for k, v in extra_data.items():
                payload_data[k] = str(v)

        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            data=payload_data,
            tokens=tokens,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    icon="ic_notification",
                    color="#6200EE",
                    sound="default",
                ),
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

        return {
            "success": True,
            "sent": response.success_count,
            "failed": response.failure_count,
        }

    except Exception as e:
        logger.error(f"Push error: {e}")
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
    """Отправка push в фоновом потоке (не блокирует)"""
    thread = threading.Thread(
        target=_send_push_sync,
        args=(title, body, notification_type, task_id, user_ids, organization_id, extra_data),
        daemon=True,
    )
    thread.start()
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
