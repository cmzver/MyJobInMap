"""
Фоновая очередь задач (ARQ + Redis) с прозрачным fallback
=========================================================
Единая точка постановки fire-and-forget задач (push-уведомления, и при
желании — геокодинг, оптимизация фото, выгрузки).

Два режима, переключаются настройкой ``TASK_QUEUE_ENABLED``:

* **queue** — задача кладётся в ARQ (Redis) и выполняется отдельным
  worker-процессом ([app/worker.py]). Даёт ретраи, изоляцию от веб-процесса и
  видимость в метриках. Требует доступного ``REDIS_URL`` и запущенного worker.
* **inline** (по умолчанию) — задача выполняется в daemon-потоке прямо в
  процессе приложения. Это прежнее поведение проекта (см. бывший
  ``push.send_push_background``), не требующее Redis. Позволяет включать
  очередь постепенно и держать dev/CI без брокера.

Если очередь включена, но Redis недоступен в момент постановки, делается
graceful fallback в inline-режим — запрос пользователя не падает.

Добавить новую задачу: зарегистрировать sync-функцию в :data:`_JOB_LOADERS`
и одноимённую корутину в [app/worker.py]. Вызывать ``enqueue("job_name", ...)``.
"""

import asyncio
import logging
import threading
from typing import Any, Callable, Dict, Optional

from app.config import settings
from app.services import metrics

logger = logging.getLogger("task_queue")


# ---------------------------------------------------------------- job registry
# job_name -> загрузчик sync-реализации (ленивый импорт во избежание циклов).
# Та же sync-функция используется и в inline-режиме, и внутри ARQ-обёртки
# воркера, поэтому поведение задачи идентично в обоих режимах.


def _load_push_send() -> Callable[..., Any]:
    from app.services.push import _send_push_sync

    return _send_push_sync


_JOB_LOADERS: Dict[str, Callable[[], Callable[..., Any]]] = {
    "push_send": _load_push_send,
}


def _resolve(job_name: str) -> Callable[..., Any]:
    try:
        loader = _JOB_LOADERS[job_name]
    except KeyError as exc:
        raise KeyError(f"Неизвестная фоновая задача: {job_name}") from exc
    return loader()


# ------------------------------------------------------------- inline executor


def _execute_sync(job_name: str, kwargs: Dict[str, Any]) -> Any:
    """Выполнить задачу синхронно (ядро inline-режима; удобно для тестов)."""
    fn = _resolve(job_name)
    try:
        result = fn(**kwargs)
        metrics.record_queue_processed(job_name, "success")
        return result
    except Exception:
        metrics.record_queue_processed(job_name, "error")
        logger.exception("Фоновая задача %s упала (inline)", job_name)
        return None


def _run_inline(job_name: str, kwargs: Dict[str, Any]) -> None:
    """Запустить задачу в daemon-потоке, не блокируя вызывающий запрос."""
    metrics.record_queue_enqueued(job_name, "inline")
    threading.Thread(
        target=_execute_sync,
        args=(job_name, kwargs),
        daemon=True,
        name=f"task-{job_name}",
    ).start()


# ------------------------------------------------------------------ ARQ bridge
# ARQ-пул асинхронный, а точки постановки (FastAPI-хендлеры, сервисы) —
# синхронные. Поэтому держим выделенный event loop в отдельном потоке и
# отправляем в него корутину постановки через run_coroutine_threadsafe.

_loop: Optional[asyncio.AbstractEventLoop] = None
_loop_lock = threading.Lock()
_pool: Any = None


def _ensure_loop() -> asyncio.AbstractEventLoop:
    global _loop
    with _loop_lock:
        if _loop is None:
            loop = asyncio.new_event_loop()
            threading.Thread(
                target=loop.run_forever, daemon=True, name="task-queue-loop"
            ).start()
            _loop = loop
        return _loop


async def _get_pool() -> Any:
    global _pool
    if _pool is None:
        from arq import create_pool
        from arq.connections import RedisSettings

        _pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    return _pool


async def _enqueue_coro(job_name: str, kwargs: Dict[str, Any]) -> None:
    pool = await _get_pool()
    await pool.enqueue_job(job_name, **kwargs)


def _enqueue_arq(job_name: str, kwargs: Dict[str, Any]) -> None:
    """Поставить задачу в ARQ. Бросает исключение при недоступности Redis."""
    loop = _ensure_loop()
    future = asyncio.run_coroutine_threadsafe(_enqueue_coro(job_name, kwargs), loop)
    future.result(timeout=3)  # подтверждаем приём (или ловим ошибку Redis)
    metrics.record_queue_enqueued(job_name, "arq")


# --------------------------------------------------------------------- public


def enqueue(job_name: str, **kwargs: Any) -> None:
    """Поставить fire-and-forget задачу.

    В режиме очереди кладёт в ARQ; при выключенной очереди или недоступном
    Redis выполняет inline в daemon-потоке. Никогда не блокирует надолго и не
    пробрасывает исключения наружу — вызывающий код не должен падать из-за
    проблем доставки.
    """
    # Валидируем имя заранее, чтобы опечатка вылезла сразу, а не в воркере.
    _resolve(job_name)

    if settings.TASK_QUEUE_ENABLED:
        try:
            _enqueue_arq(job_name, kwargs)
            return
        except Exception as exc:  # Redis недоступен/таймаут — не валим запрос
            logger.warning(
                "ARQ enqueue не удался для %s (%s) — выполняю inline",
                job_name,
                exc,
            )

    _run_inline(job_name, kwargs)
