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
"""

import logging

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
