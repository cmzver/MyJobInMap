"""Запуск и остановка приложения целиком — lifespan, который обычные тесты
не выполняют (TestClient без ``with``).

Каждый вариант — отдельный процесс: lifespan создаёт движок БД, потоки и
фоновые задачи на уровне модулей, им нельзя смешиваться с остальным прогоном.
Процесс обязан подняться, ответить и завершиться за отведённое время —
так ловятся падения на старте (импорты, миграции, конфиг) и зависания на
остановке (незавершённые фоновые задачи).
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

SERVER = Path(__file__).resolve().parents[1]

SCENARIO = r"""
import sys

from app.config import settings

if sys.argv[1] == "redis":
    import fakeredis

    from app.services import redis_realtime

    server = fakeredis.FakeServer()
    settings.REALTIME_REDIS_ENABLED = True
    settings.REDIS_URL = "redis://fake:6379/0"
    redis_realtime.set_clients(
        fakeredis.FakeAsyncRedis(server=server, decode_responses=True),
        fakeredis.FakeRedis(server=server, decode_responses=True),
    )

from fastapi.testclient import TestClient

from main import app

with TestClient(app) as client:
    assert client.get("/health").status_code == 200
    login = client.post(
        "/api/auth/login", data={"username": "admin", "password": "admin"}
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    if sys.argv[1] == "redis":
        from app.services import redis_realtime

        status = redis_realtime.status()
        assert status["enabled"] and status["subscribed"], status
    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert "http_requests_total" in metrics.text
print("LIFESPAN-OK")
"""


@pytest.mark.parametrize("mode", ["plain", "redis"])
def test_app_starts_serves_and_stops(mode, tmp_path):
    env = {
        **os.environ,
        "DATABASE_URL": "sqlite:///" + (tmp_path / "lifespan.db").as_posix(),
        "RUN_MIGRATIONS_ON_STARTUP": "true",
        "ENVIRONMENT": "development",
        "OUTBOX_ENABLED": "true",
        "REALTIME_REDIS_ENABLED": "false",
        "BACKUP_SCHEDULER_ENABLED": "false",
    }
    if mode == "redis":
        # Как в контейнере: метрики нескольких процессов (scripts/start-api.sh)
        metrics_dir = tmp_path / "prometheus"
        metrics_dir.mkdir()
        env["PROMETHEUS_MULTIPROC_DIR"] = str(metrics_dir)
    else:
        env.pop("PROMETHEUS_MULTIPROC_DIR", None)
    result = subprocess.run(
        [sys.executable, "-c", SCENARIO, mode],
        cwd=SERVER,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )
    assert result.returncode == 0 and "LIFESPAN-OK" in result.stdout, (
        result.stdout[-3000:] + result.stderr[-5000:]
    )
