"""Redis для нескольких процессов API: шина WebSocket и лидерство.

Без REALTIME_REDIS_ENABLED (один процесс, разработка, тесты) модуль ничего не
делает: события доставляются в памяти процесса, любой процесс — «лидер».

Шина. Процесс, у которого случилось событие, публикует его в канал; каждый
процесс (и он сам) получает его подпиской и доставляет своим WebSocket-
соединениям. Если Redis недоступен, событие доставляется только локально —
так же, как работал один процесс, — и это видно в логах.

Лидерство. Задания, которые нельзя выполнять одновременно в нескольких
процессах (бэкапы; напоминания о сроках — чтобы не делать работу дважды),
выполняет держатель аренды-ключа в Redis. Аренда продлевается, пока процесс
жив; упавший процесс теряет её через LEADER_TTL_SECONDS.
"""

import asyncio
import json
import logging
import os
import socket
import uuid
from typing import Any, Awaitable, Callable, Optional

from app.config import settings

logger = logging.getLogger(__name__)

CHANNEL = "fieldworker:ws"
LEADER_KEY = "fieldworker:leader"
LEADER_TTL_SECONDS = 60
LEADER_RENEW_SECONDS = 20
_RECONNECT_DELAY_SECONDS = 2

# Уникален для процесса: так в логах и в ключе лидера видно, кто есть кто
PROCESS_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:6]}"

Handler = Callable[[dict], Awaitable[None]]

_async_client = None
_sync_client = None
_subscriber: Optional[asyncio.Task] = None
_leader_task: Optional[asyncio.Task] = None
_is_leader = False


def enabled() -> bool:
    return bool(settings.REALTIME_REDIS_ENABLED and settings.REDIS_URL)


def async_client():
    global _async_client
    if _async_client is None:
        import redis.asyncio as aioredis

        _async_client = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True, socket_timeout=5
        )
    return _async_client


def sync_client():
    """Синхронный клиент — для лимитера входа (вызывается из sync-маршрутов)."""
    global _sync_client
    if _sync_client is None:
        import redis

        _sync_client = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=2,
            socket_connect_timeout=2,
        )
    return _sync_client


def set_clients(async_redis=None, sync_redis=None) -> None:
    """Подменить клиенты (тесты: fakeredis)."""
    global _async_client, _sync_client
    _async_client = async_redis
    _sync_client = sync_redis


# ------------------------------------------------------------------ шина


async def publish(message: dict) -> bool:
    """Отправить событие всем процессам; False — Redis недоступен."""
    try:
        await async_client().publish(CHANNEL, json.dumps(message, default=str))
        return True
    except Exception as exc:  # noqa: BLE001 — любой сбой Redis = локальная доставка
        logger.warning("Шина WebSocket: Redis недоступен (%s)", type(exc).__name__)
        return False


async def _subscribe_loop(handler: Handler) -> None:
    while True:
        pubsub = None
        try:
            pubsub = async_client().pubsub()
            await pubsub.subscribe(CHANNEL)
            logger.info("Шина WebSocket: подписка на %s (%s)", CHANNEL, PROCESS_ID)
            async for item in pubsub.listen():
                if item.get("type") != "message":
                    continue
                try:
                    await handler(json.loads(item["data"]))
                except Exception:
                    logger.exception("Шина WebSocket: не удалось доставить событие")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Шина WebSocket: подписка прервана (%s), переподключение",
                type(exc).__name__,
            )
            await asyncio.sleep(_RECONNECT_DELAY_SECONDS)
        finally:
            if pubsub is not None:
                try:
                    await pubsub.aclose()
                except Exception:  # noqa: BLE001
                    pass


# ------------------------------------------------------- сброс кэшей процессов

# Кэши в памяти процесса (бан-лист ip_guard, состав чатов) регистрируют здесь
# функцию сброса; invalidate() вызывает её в этом процессе и рассылает по шине
# остальным — изменение видно всем процессам сразу, а не по истечении TTL.
Invalidator = Callable[[Optional[str]], None]
_invalidators: dict[str, Invalidator] = {}


def register_invalidator(name: str, fn: Invalidator) -> None:
    _invalidators[name] = fn


def apply_invalidation(name: str, key: Optional[str] = None) -> None:
    fn = _invalidators.get(name)
    if fn is None:
        return
    try:
        fn(key)
    except Exception:  # noqa: BLE001 — сброс кэша не должен ронять запрос
        logger.exception("Сброс кэша %s не удался", name)


def invalidate(name: str, key: Any = None) -> None:
    """Сбросить кэш ``name`` (целиком или по ``key``) во всех процессах.

    Можно вызывать и из потока (sync-маршруты), и из event loop.
    """
    key = None if key is None else str(key)
    apply_invalidation(name, key)
    if not enabled():
        return
    message = {"op": "invalidate", "cache": name, "key": key}
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None:
        # В event loop синхронный клиент заблокировал бы все соединения
        loop.create_task(publish(message))
        return
    try:
        sync_client().publish(CHANNEL, json.dumps(message))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Сброс кэша %s: Redis недоступен (%s) — другие процессы обновятся по TTL",
            name,
            type(exc).__name__,
        )


def start_subscriber(handler: Handler) -> bool:
    global _subscriber
    if not enabled():
        return False
    _subscriber = asyncio.get_running_loop().create_task(_subscribe_loop(handler))
    return True


# -------------------------------------------------------------- лидерство


def is_leader() -> bool:
    """Выполнять ли этому процессу задания «только в одном экземпляре»."""
    return True if not enabled() else _is_leader


async def _try_lead() -> bool:
    redis = async_client()
    acquired = await redis.set(LEADER_KEY, PROCESS_ID, nx=True, ex=LEADER_TTL_SECONDS)
    if acquired:
        return True
    if await redis.get(LEADER_KEY) == PROCESS_ID:
        await redis.expire(LEADER_KEY, LEADER_TTL_SECONDS)
        return True
    return False


async def _leader_loop() -> None:
    global _is_leader
    while True:
        try:
            leading = await _try_lead()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            # Без Redis не знаем, жив ли лидер, — безопаснее не делать работу
            # дважды; задания догонят пропущенное, когда Redis вернётся.
            logger.warning("Лидерство: Redis недоступен (%s)", type(exc).__name__)
            leading = False
        if leading != _is_leader:
            logger.info(
                "Лидерство: %s %s", PROCESS_ID, "получено" if leading else "потеряно"
            )
        _is_leader = leading
        await asyncio.sleep(LEADER_RENEW_SECONDS)


def start_leader_election() -> bool:
    global _leader_task
    if not enabled():
        return False
    _leader_task = asyncio.get_running_loop().create_task(_leader_loop())
    return True


async def _release_leadership() -> None:
    """При остановке отдать аренду сразу, а не ждать истечения TTL."""
    try:
        redis = async_client()
        if await redis.get(LEADER_KEY) == PROCESS_ID:
            await redis.delete(LEADER_KEY)
    except Exception:  # noqa: BLE001
        pass


async def stop() -> None:
    global _subscriber, _leader_task, _is_leader
    for task in (_subscriber, _leader_task):
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    _subscriber = _leader_task = None
    if enabled() and _is_leader:
        await _release_leadership()
    _is_leader = False


def status() -> dict[str, Any]:
    return {
        "enabled": enabled(),
        "process": PROCESS_ID,
        "leader": is_leader(),
        "subscribed": _subscriber is not None and not _subscriber.done(),
    }
