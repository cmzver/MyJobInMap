"""
Бизнес-метрики Prometheus
=========================
HTTP-метрики (latency, статус-коды, RPS) предоставляет
``prometheus-fastapi-instrumentator`` в [main.py] на эндпоинте ``/metrics``.
Этот модуль добавляет ДОМЕННЫЕ метрики поверх той же DEFAULT-registry —
их отдаёт тот же ``/metrics``, отдельный экспортер не нужен.

Все метрики безопасны к импорту: ``prometheus_client`` идёт зависимостью
инструментатора. Если библиотеки нет (напр. в урезанном окружении), метрики
становятся no-op заглушками, поэтому инструментирование сервисов никогда не
роняет приложение. Инструментируйте через функции ``record_*`` — это держит
импорты в местах вызова лёгкими и единообразными.

Несколько процессов API (uvicorn --workers N): scripts/start-api.sh задаёт
``PROMETHEUS_MULTIPROC_DIR`` — каждый процесс пишет значения в файлы, а
``/metrics`` (инструментатор) суммирует их по всем процессам. Gauge поэтому
объявляются с ``multiprocess_mode``.
"""

import glob
import logging
import os
import re

logger = logging.getLogger("metrics")

try:
    from prometheus_client import Counter, Gauge, Histogram

    _ENABLED = True
except ImportError:  # pragma: no cover - prometheus_client обычно установлен
    _ENABLED = False

    class _NoopMetric:
        """Заглушка с интерфейсом Counter/Gauge/Histogram."""

        def labels(self, *args, **kwargs):
            return self

        def inc(self, *args, **kwargs):
            pass

        def observe(self, *args, **kwargs):
            pass

        def set(self, *args, **kwargs):
            pass

    def Counter(*args, **kwargs):  # type: ignore[misc]
        return _NoopMetric()

    def Gauge(*args, **kwargs):  # type: ignore[misc]
        return _NoopMetric()

    def Histogram(*args, **kwargs):  # type: ignore[misc]
        return _NoopMetric()


# ----------------------------------------------------------------- definitions

tasks_created_total = Counter(
    "fieldworker_tasks_created_total",
    "Создано заявок",
    ["priority"],
)

task_status_transitions_total = Counter(
    "fieldworker_task_status_transitions_total",
    "Переходы статуса заявок (state machine)",
    ["from_status", "to_status"],
)

push_sent_total = Counter(
    "fieldworker_push_sent_total",
    "Результаты отправки push-уведомлений",
    ["result"],  # success | failed | no_devices | error | not_configured
)

queue_jobs_enqueued_total = Counter(
    "fieldworker_queue_jobs_enqueued_total",
    "Задачи, поставленные в фоновую очередь",
    ["job", "mode"],  # mode: arq | inline
)

queue_jobs_processed_total = Counter(
    "fieldworker_queue_jobs_processed_total",
    "Обработанные фоновые задачи",
    ["job", "result"],  # result: success | error
)

websocket_connections = Gauge(
    "fieldworker_websocket_connections",
    "Активные WebSocket-подключения",
    # Сумма по живым процессам: у каждого процесса свои соединения
    multiprocess_mode="livesum",
)


# -------------------------------------------------------------------- recorders


def record_task_created(priority) -> None:
    tasks_created_total.labels(priority=str(priority or "unknown")).inc()


def record_status_transition(from_status, to_status) -> None:
    task_status_transitions_total.labels(
        from_status=str(from_status or "none"),
        to_status=str(to_status or "none"),
    ).inc()


def record_push_result(result: str, count: int = 1) -> None:
    push_sent_total.labels(result=result).inc(count)


def record_queue_enqueued(job: str, mode: str) -> None:
    queue_jobs_enqueued_total.labels(job=job, mode=mode).inc()


def record_queue_processed(job: str, result: str) -> None:
    queue_jobs_processed_total.labels(job=job, result=result).inc()


def set_websocket_connections(value: int) -> None:
    websocket_connections.set(value)


# ------------------------------------------------------------- multiprocess

_GAUGE_FILE = re.compile(r"gauge_live\w+_(\d+)\.db$")


def _multiproc_dir():
    return os.environ.get("PROMETHEUS_MULTIPROC_DIR") if _ENABLED else None


def _pid_alive(pid: int) -> bool:
    if os.name == "nt":
        # На Windows os.kill(pid, 0) не проверяет, а ЗАВЕРШАЕТ процесс
        return True
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except (PermissionError, OSError):
        return True  # процесс есть, но не наш — считаем живым
    return True


def cleanup_dead_processes() -> int:
    """Убрать «живые» gauge процессов, упавших без штатной остановки.

    Иначе livesum продолжал бы учитывать их соединения. Вызывается при старте
    каждого процесса API; возвращает число убранных процессов.
    """
    path = _multiproc_dir()
    if not path:
        return 0
    from prometheus_client import multiprocess

    dead = set()
    for name in glob.glob(os.path.join(path, "gauge_live*_*.db")):
        match = _GAUGE_FILE.search(name)
        if match and int(match.group(1)) != os.getpid():
            pid = int(match.group(1))
            if not _pid_alive(pid):
                dead.add(pid)
    for pid in dead:
        multiprocess.mark_process_dead(pid, path)
    return len(dead)


def mark_this_process_dead() -> None:
    """Штатная остановка процесса API — его gauge больше не учитываются."""
    path = _multiproc_dir()
    if not path:
        return
    from prometheus_client import multiprocess

    try:
        multiprocess.mark_process_dead(os.getpid(), path)
    except OSError as exc:  # остановку не роняем: в худшем случае уберёт cleanup
        logger.warning("Метрики: не удалось убрать gauge процесса (%s)", exc)
