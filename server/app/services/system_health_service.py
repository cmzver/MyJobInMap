"""
System Health Service
=====================
Агрегирует состояние сервера для панели супер-админа «Состояние сервера»:
ресурсы хоста (CPU/RAM/диск/uptime через psutil), доступность БД и Redis,
backup-scheduler, WebSocket и статус контейнеров.

Статус контейнеров берётся через docker-socket-proxy (tecnativa) — отдельный
контейнер, который пробрасывает ТОЛЬКО read-эндпоинты Docker API, поэтому сам
api не получает прямого (root-эквивалентного) доступа к /var/run/docker.sock.
Адрес прокси — в DOCKER_PROXY_URL (например http://docker-proxy:2375); если он
не задан или недоступен, блок контейнеров возвращается как unavailable, а
остальная health-сводка отдаётся как обычно.
"""

from __future__ import annotations

import logging
import os
import platform
import re
import time

import psutil
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger(__name__)

DOCKER_PROXY_URL = os.getenv("DOCKER_PROXY_URL", "").rstrip("/")
REDIS_URL = os.getenv("REDIS_URL", "")
# Публичный URL Grafana (если мониторинг-стек развёрнут и проксирован) — портал
# покажет кнопку «Открыть Grafana» только когда он задан.
GRAFANA_PUBLIC_URL = os.getenv("GRAFANA_PUBLIC_URL", "")

# "Up 2 minutes (healthy)" / "Up 5 seconds (health: starting)" / "Up 3 hours"
_HEALTH_RE = re.compile(
    r"\((?:health: )?(healthy|unhealthy|starting|health: starting)\)"
)


def _uptime_seconds() -> int:
    """Аптайм процесса api (с момента старта), в секундах."""
    try:
        return int(time.time() - psutil.Process().create_time())
    except Exception:  # pragma: no cover - defensive
        return 0


def _system_metrics() -> dict:
    """Метрики хоста: CPU, память, диск. interval=None — без блокировки."""
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    load = None
    if hasattr(os, "getloadavg"):
        try:
            load = [round(x, 2) for x in os.getloadavg()]
        except OSError:
            load = None
    return {
        "cpu_percent": psutil.cpu_percent(interval=None),
        "cpu_count": psutil.cpu_count(),
        "load_avg": load,
        "memory": {
            "total_mb": round(vm.total / 1024 / 1024),
            "used_mb": round(vm.used / 1024 / 1024),
            "percent": vm.percent,
        },
        "disk": {
            "total_gb": round(disk.total / 1024 / 1024 / 1024, 1),
            "used_gb": round(disk.used / 1024 / 1024 / 1024, 1),
            "percent": disk.percent,
        },
        "uptime_seconds": _uptime_seconds(),
    }


def _database_status(db: Session) -> dict:
    try:
        db.execute(text("SELECT 1"))
        dialect = db.get_bind().dialect.name
        return {
            "status": "ok",
            "engine": "PostgreSQL" if dialect != "sqlite" else "SQLite",
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {"status": "error", "error": str(exc)}


def _redis_status() -> dict:
    if not REDIS_URL:
        return {"status": "not_configured"}
    try:
        import redis  # локальный импорт: redis идёт зависимостью arq

        client = redis.from_url(REDIS_URL, socket_connect_timeout=2, socket_timeout=2)
        client.ping()
        client.close()
        return {"status": "ok"}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def _parse_health(status_text: str) -> str | None:
    match = _HEALTH_RE.search(status_text or "")
    if not match:
        return None
    value = match.group(1)
    return "starting" if value in ("starting", "health: starting") else value


def _containers() -> dict:
    """Статус контейнеров через docker-socket-proxy (read-only Docker API)."""
    if not DOCKER_PROXY_URL:
        return {"available": False, "reason": "docker proxy not configured"}
    try:
        import httpx

        resp = httpx.get(
            f"{DOCKER_PROXY_URL}/containers/json", params={"all": "1"}, timeout=4
        )
        resp.raise_for_status()
        items = []
        for c in resp.json():
            name = (c.get("Names") or ["/?"])[0].lstrip("/")
            status_text = c.get("Status", "")
            items.append(
                {
                    "name": name,
                    "image": c.get("Image", ""),
                    "state": c.get("State", ""),  # running | exited | restarting | ...
                    "status": status_text,  # "Up 2 minutes (healthy)"
                    "health": _parse_health(
                        status_text
                    ),  # healthy|unhealthy|starting|None
                }
            )
        items.sort(key=lambda i: i["name"])
        return {"available": True, "containers": items}
    except Exception as exc:
        logger.warning("Container status fetch failed: %s", exc)
        return {"available": False, "reason": str(exc)}


def collect_health(db: Session) -> dict:
    """Полная health-сводка для панели супер-админа."""
    from app.services.backup_scheduler import get_scheduler_status
    from app.services.websocket_manager import ws_manager

    database = _database_status(db)
    redis_status = _redis_status()
    containers = _containers()

    # Общий вердикт: degraded, если БД/Redis не ok или есть упавший контейнер.
    overall = "ok"
    if database.get("status") != "ok" or redis_status.get("status") not in (
        "ok",
        "not_configured",
    ):
        overall = "degraded"
    if containers.get("available"):
        for c in containers["containers"]:
            if c["state"] not in ("running",) or c["health"] == "unhealthy":
                overall = "degraded"

    return {
        "status": overall,
        "version": settings.API_VERSION,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "database": database,
        "redis": redis_status,
        "system": _system_metrics(),
        "backup_scheduler": get_scheduler_status(),
        "websocket": ws_manager.get_status(),
        "containers": containers,
        "monitoring": {"grafana_url": GRAFANA_PUBLIC_URL or None},
    }
