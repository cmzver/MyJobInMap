"""Тесты фоновой очереди задач (task_queue) и её интеграции с push.

Проверяется маршрутизация enqueue по режимам (inline / ARQ / graceful
fallback) без реального Redis — ARQ-постановка подменяется. Реальная доставка
в ARQ тестируется отдельно в интеграционном окружении с Redis.
"""

import threading

import pytest

from app.config import settings
from app.services import task_queue


@pytest.fixture
def temp_job(monkeypatch):
    """Зарегистрировать временную задачу, фиксирующую вызовы."""
    calls = []
    done = threading.Event()

    def job(**kwargs):
        calls.append(kwargs)
        done.set()
        return "ok"

    monkeypatch.setitem(task_queue._JOB_LOADERS, "test_job", lambda: job)
    return calls, done


class TestResolve:
    def test_unknown_job_raises(self):
        with pytest.raises(KeyError):
            task_queue._resolve("does_not_exist")

    def test_push_send_is_registered(self):
        # дефолтная задача резолвится в реальную реализацию
        assert callable(task_queue._resolve("push_send"))

    def test_execute_sync_runs_and_returns(self, temp_job):
        calls, _ = temp_job
        result = task_queue._execute_sync("test_job", {"a": 1})
        assert result == "ok"
        assert calls == [{"a": 1}]

    def test_execute_sync_swallows_errors(self, monkeypatch):
        def boom(**kwargs):
            raise RuntimeError("fail")

        monkeypatch.setitem(task_queue._JOB_LOADERS, "boom_job", lambda: boom)
        # ошибка задачи не должна пробрасываться наружу
        assert task_queue._execute_sync("boom_job", {}) is None


class TestEnqueueRouting:
    def test_inline_when_disabled(self, temp_job, monkeypatch):
        calls, done = temp_job
        monkeypatch.setattr(settings, "TASK_QUEUE_ENABLED", False)
        task_queue.enqueue("test_job", x=5)
        assert done.wait(timeout=2)
        assert calls == [{"x": 5}]

    def test_uses_arq_when_enabled(self, temp_job, monkeypatch):
        calls, _ = temp_job
        monkeypatch.setattr(settings, "TASK_QUEUE_ENABLED", True)
        enqueued = []
        monkeypatch.setattr(
            task_queue,
            "_enqueue_arq",
            lambda name, kw: enqueued.append((name, kw)),
        )
        task_queue.enqueue("test_job", x=1)
        assert enqueued == [("test_job", {"x": 1})]
        # inline-исполнение не запускалось
        assert calls == []

    def test_falls_back_to_inline_when_arq_fails(self, temp_job, monkeypatch):
        calls, done = temp_job
        monkeypatch.setattr(settings, "TASK_QUEUE_ENABLED", True)

        def boom(name, kw):
            raise RuntimeError("redis down")

        monkeypatch.setattr(task_queue, "_enqueue_arq", boom)
        task_queue.enqueue("test_job", y=2)
        assert done.wait(timeout=2)
        assert calls == [{"y": 2}]

    def test_unknown_job_raises_before_dispatch(self, monkeypatch):
        monkeypatch.setattr(settings, "TASK_QUEUE_ENABLED", False)
        with pytest.raises(KeyError):
            task_queue.enqueue("does_not_exist")


class TestPushUsesQueue:
    def test_send_push_background_enqueues_push_job(self, monkeypatch):
        captured = {}

        def fake_enqueue(name, **kwargs):
            captured["job"] = name
            captured["kwargs"] = kwargs

        monkeypatch.setattr(task_queue, "enqueue", fake_enqueue)

        from app.services import push

        push.send_push_background("Title", "Body", notification_type="chat", task_id=7)

        assert captured["job"] == "push_send"
        assert captured["kwargs"]["title"] == "Title"
        assert captured["kwargs"]["body"] == "Body"
        assert captured["kwargs"]["notification_type"] == "chat"
        assert captured["kwargs"]["task_id"] == 7
