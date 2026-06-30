"""
On-demand WireGuard manager
===========================
Поднимает WireGuard-туннель только на время обращения к панели и опускает
его после короткого простоя («лингера»). Нужен, чтобы прод-сервер дотянулся
до панельной подсети (10.80.0.0/16), переиспользуя личный пир, не держа
туннель постоянно (один пир нельзя одновременно держать на двух хостах).

Семантика:
- `async with manager.session():` — внутри гарантированно поднят туннель;
- несколько одновременных сессий делят один `wg-quick up` (рефкаунт);
- когда последняя сессия закрылась, туннель опускается через BEWARD_WG_LINGER
  секунд (серия кликов не дёргает интерфейс вверх-вниз);
- при BEWARD_WG_ENABLED=false менеджер — no-op (локально туннель уже поднят).

Реализация интерфейса (ядро vs userspace wireguard-go) — забота образа/хоста,
менеджер лишь вызывает `wg-quick up/down`.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from app.config import settings

_log = logging.getLogger(__name__)


class WireGuardError(Exception):
    """Не удалось поднять/опустить туннель."""


class WireGuardManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._refcount = 0
        self._up = False
        self._teardown_task: Optional[asyncio.Task] = None

    @property
    def enabled(self) -> bool:
        return settings.BEWARD_WG_ENABLED

    async def _run(self, *args: str) -> None:
        """Выполнить команду, бросить WireGuardError при ненулевом коде."""
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            msg = stderr.decode(errors="replace").strip()
            raise WireGuardError(f"{' '.join(args)} -> {proc.returncode}: {msg}")

    async def _bring_up(self) -> None:
        await self._run("wg-quick", "up", settings.BEWARD_WG_CONF)
        _log.info("WireGuard up (%s)", settings.BEWARD_WG_CONF)

    async def _bring_down(self) -> None:
        await self._run("wg-quick", "down", settings.BEWARD_WG_CONF)
        _log.info("WireGuard down (%s)", settings.BEWARD_WG_CONF)

    @asynccontextmanager
    async def session(self):
        if not self.enabled:
            yield
            return
        await self._acquire()
        try:
            yield
        finally:
            await self._release()

    async def _acquire(self) -> None:
        async with self._lock:
            # Отменяем отложенный teardown — туннель снова нужен.
            if self._teardown_task and not self._teardown_task.done():
                self._teardown_task.cancel()
            self._teardown_task = None
            if not self._up:
                await self._bring_up()
                self._up = True
            self._refcount += 1

    async def _release(self) -> None:
        async with self._lock:
            self._refcount = max(0, self._refcount - 1)
            if self._refcount == 0 and self._up:
                self._teardown_task = asyncio.create_task(self._linger_teardown())

    async def _linger_teardown(self) -> None:
        try:
            await asyncio.sleep(settings.BEWARD_WG_LINGER)
        except asyncio.CancelledError:
            return
        async with self._lock:
            if self._refcount == 0 and self._up:
                try:
                    await self._bring_down()
                    self._up = False
                except WireGuardError as exc:
                    _log.warning("WireGuard down failed: %s", exc)


# Синглтон менеджера.
manager = WireGuardManager()


def session():
    """Контекст-менеджер сессии туннеля (см. WireGuardManager.session)."""
    return manager.session()
