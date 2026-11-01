"""
Periodic Jobs
=============
Периодические задания в процессе API: напоминания о сроках заявок и утренний
дайджест просрочки (sla_escalation).

Живут здесь, а не в ARQ-воркере: уведомления сразу уходят по WebSocket, а
менеджер соединений есть только в веб-процессе. Повторный и параллельный
запуск безопасен — каждое напоминание защищено уникальным ключом в БД.

Выключается PERIODIC_JOBS_ENABLED=false; разовый запуск без сервера —
``python -m app.jobs``.
"""

import asyncio
import logging
from datetime import datetime
from typing import List, Optional

from app.config import settings
from app.models.base import SessionLocal
from app.services import metrics
from app.services.notification_service import broadcast_created_notification_async
from app.services.sla_escalation import Payload, run_overdue_digest, run_sla_tick

logger = logging.getLogger(__name__)

# Первый проход — не сразу при старте: даём серверу подняться.
_FIRST_RUN_DELAY_SECONDS = 60

_task: Optional[asyncio.Task] = None


def run_due_jobs(now: Optional[datetime] = None) -> List[Payload]:
    """Один проход всех заданий. Возвращает события для WebSocket."""
    with SessionLocal() as db:
        return run_sla_tick(db, now) + run_overdue_digest(db, now)


async def _loop(interval: int) -> None:
    await asyncio.sleep(min(_FIRST_RUN_DELAY_SECONDS, interval))
    while True:
        try:
            payloads = await asyncio.to_thread(run_due_jobs)
            for user_id, event in payloads:
                await broadcast_created_notification_async(user_id, event)
            metrics.record_queue_processed("periodic_jobs", "success")
        except asyncio.CancelledError:
            raise
        except Exception:
            metrics.record_queue_processed("periodic_jobs", "error")
            logger.exception("Периодические задания: проход упал")
        await asyncio.sleep(interval)


def start_periodic_jobs() -> bool:
    """Запустить цикл (из lifespan, внутри event loop)."""
    global _task
    if not settings.PERIODIC_JOBS_ENABLED:
        logger.info("Periodic jobs disabled (PERIODIC_JOBS_ENABLED=false)")
        return False
    _task = asyncio.get_running_loop().create_task(
        _loop(settings.PERIODIC_JOBS_INTERVAL_SECONDS)
    )
    logger.info(
        "⏰ Periodic jobs started (every %ds)", settings.PERIODIC_JOBS_INTERVAL_SECONDS
    )
    return True


async def stop_periodic_jobs() -> None:
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    _task = None
