"""
Beward intercom driver
======================
Тонкий асинхронный клиент к веб-интерфейсу домофонных панелей Beward
(серия DKS, прошивка IPCamera-Webs). Реверс подтверждён на DKS15198.

Особенности устройства:
- авторизация HTTP Digest (общий аккаунт из settings.BEWARD_*);
- команды двери идут GET-запросом на /webs/btnSettingEx (POST с телом
  устройство рвёт), flag=4600, paramctrl=1 — открыть, 0 — закрыть;
- статус замка и «код записи ключей» читаются инлайн из server-rendered
  .asp-страниц (login.asp, mifare.asp) — обычным GET, без побочных эффектов;
- видео отдаётся как JPEG-кадр через /cgi-bin/images_cgi.

«Мягкий режим»: на каждую панель — отдельный asyncio.Lock (запросы одной
учёткой не идут параллельно), кадр кэшируется на короткий TTL, шлём
браузерный User-Agent и ровно те же URL, что и штатная веб-морда.
Никакого фонового поллинга — только on-demand.
"""

import asyncio
import re
import secrets
import time
from typing import Dict, Optional, Tuple

import httpx

from app.config import settings
from app.services import wireguard

# Браузерный User-Agent — чтобы запросы были неотличимы от штатной веб-морды.
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

_DOOR_FLAG = 4600  # команда "двери" в btnSettingEx

# Сериализация запросов на одну панель + короткий кэш кадра.
_locks: Dict[str, asyncio.Lock] = {}
_snapshot_cache: Dict[str, Tuple[float, bytes]] = {}

_RE_LOCK_OPEN = re.compile(r"bopendoorson\.value\s*=\s*'?([0-9]+)'?")
_RE_REGCODE = re.compile(r"regcode\.value\s*=\s*'?([0-9]+)'?")
_RE_REGACTIVE = re.compile(r"ckregactive\.checked\s*=\s*([0-9]+)")


class BewardError(Exception):
    """Базовая ошибка работы с панелью."""


class BewardUnreachable(BewardError):
    """Панель недоступна (сеть/таймаут) — нет WireGuard или устройство офлайн."""


class BewardAuthError(BewardError):
    """Учётные данные панели отвергнуты (401)."""


def _key(host: str, port: int) -> str:
    return f"{host}:{port}"


def _lock(host: str, port: int) -> asyncio.Lock:
    key = _key(host, port)
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return lock


def _base_url(host: str, port: int) -> str:
    return f"http://{host}:{port}"


def _client() -> httpx.AsyncClient:
    if not settings.BEWARD_USER:
        raise BewardError("BEWARD_USER/BEWARD_PASSWORD не настроены")
    return httpx.AsyncClient(
        auth=httpx.DigestAuth(settings.BEWARD_USER, settings.BEWARD_PASSWORD),
        timeout=settings.BEWARD_TIMEOUT,
        headers={"User-Agent": _USER_AGENT},
        follow_redirects=False,
    )


async def _get(host: str, port: int, path: str) -> httpx.Response:
    """GET по панели с обработкой сетевых ошибок и 401.

    Оборачивается в on-demand WireGuard-сессию: туннель поднимается на время
    обращения (no-op, если WG отключён или уже поднят).
    """
    url = _base_url(host, port) + path
    try:
        async with wireguard.session():
            async with _client() as client:
                resp = await client.get(url)
    except wireguard.WireGuardError as exc:
        raise BewardUnreachable(f"WireGuard: {exc}") from exc
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
        raise BewardUnreachable(str(exc)) from exc
    except httpx.HTTPError as exc:
        raise BewardError(str(exc)) from exc
    if resp.status_code == 401:
        raise BewardAuthError("Панель отвергла учётные данные (401)")
    return resp


# ============================================
# Pure parsers (unit-testable)
# ============================================


def parse_lock_open(html: str) -> bool:
    """True если дверь удержана открытой (bopendoorson=1)."""
    m = _RE_LOCK_OPEN.search(html)
    return bool(m and m.group(1) == "1")


def parse_mifare_scan(html: str) -> Tuple[Optional[str], bool]:
    """(код записи ключей, активен?) из mifare.asp."""
    code_m = _RE_REGCODE.search(html)
    active_m = _RE_REGACTIVE.search(html)
    code = code_m.group(1) if code_m else None
    active = bool(active_m and active_m.group(1) == "1")
    return code, active


# ============================================
# Device operations (on-demand)
# ============================================


async def _door(host: str, port: int, ctrl: int) -> None:
    """ctrl=1 открыть (удержать), ctrl=0 закрыть."""
    rnd = secrets.token_hex(4)
    path = (
        f"/webs/btnSettingEx?flag={_DOOR_FLAG}&paramchannel=0&paramcmd=0"
        f"&paramctrl={ctrl}&paramstep=0&paramreserved=0&UserID={rnd}"
    )
    async with _lock(host, port):
        resp = await _get(host, port, path)
    if resp.status_code != 200:
        raise BewardError(f"Команда двери вернула {resp.status_code}")


async def open_door(host: str, port: int) -> None:
    await _door(host, port, 1)


async def close_door(host: str, port: int) -> None:
    await _door(host, port, 0)


async def get_lock_status(host: str, port: int) -> bool:
    """True = дверь открыта/удержана, False = закрыта. Read-only."""
    async with _lock(host, port):
        resp = await _get(host, port, "/login.asp")
    return parse_lock_open(resp.text)


async def get_mifare_scan_code(host: str, port: int) -> Tuple[Optional[str], bool]:
    """Код режима записи ключей и флаг активности. Read-only."""
    async with _lock(host, port):
        resp = await _get(host, port, "/mifare.asp")
    return parse_mifare_scan(resp.text)


async def get_snapshot(host: str, port: int) -> bytes:
    """JPEG-кадр с камеры панели (с коротким кэшем). Read-only."""
    key = _key(host, port)
    ttl = settings.BEWARD_SNAPSHOT_CACHE_TTL
    cached = _snapshot_cache.get(key)
    if cached and (time.monotonic() - cached[0]) < ttl:
        return cached[1]

    async with _lock(host, port):
        # повторная проверка под локом — несколько ждавших обходятся одним хитом
        cached = _snapshot_cache.get(key)
        if cached and (time.monotonic() - cached[0]) < ttl:
            return cached[1]
        rnd = secrets.token_hex(4)
        resp = await _get(host, port, f"/cgi-bin/images_cgi?channel=0&r={rnd}")
        data = resp.content
        if resp.status_code != 200 or not data[:2] == b"\xff\xd8":
            raise BewardError("Панель не вернула JPEG-кадр")
        _snapshot_cache[key] = (time.monotonic(), data)
        return data
