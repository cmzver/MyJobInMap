"""
ARQ Worker
==========
Фоновый обработчик очереди задач.

Запуск (нужен установленный ``arq`` и доступный Redis по ``REDIS_URL``)::

    cd server && arq app.worker.WorkerSettings

Со стороны веб-процесса для постановки задач в очередь должно быть включено
``TASK_QUEUE_ENABLED=true`` (иначе он выполняет их inline и worker не нужен).

Каждая корутина-задача делегирует СИНХРОННОЙ реализации через
``asyncio.to_thread`` — той же, что используется в inline-режиме
[app/services/task_queue.py], чтобы поведение не расходилось между режимами.
"""

import asyncio
import logging

from arq.connections import RedisSettings

from app.config import settings
from app.services import metrics

logger = logging.getLogger("worker")


async def push_send(ctx, **kwargs):
    """Отправка push-уведомлений (см. push._send_push_sync)."""
    from app.services.push import _send_push_sync

    try:
        result = await asyncio.to_thread(_send_push_sync, **kwargs)
        metrics.record_queue_processed("push_send", "success")
        return result
    except Exception:
        metrics.record_queue_processed("push_send", "error")
        raise  # пусть ARQ сделает retry


async def _startup(ctx) -> None:
    logger.info("ARQ worker запущен (Redis: %s)", settings.REDIS_URL)


async def _shutdown(ctx) -> None:
    logger.info("ARQ worker остановлен")


class WorkerSettings:
    """Конфигурация ARQ-воркера (``arq app.worker.WorkerSettings``)."""

    functions = [push_send]
    on_startup = _startup
    on_shutdown = _shutdown
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_tries = 3  # ретраи при сбое доставки
