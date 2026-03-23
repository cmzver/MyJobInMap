"""
Tests for Reports API
=====================
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.models import TaskModel, UserModel, UserRole
from app.services.auth import get_password_hash


def test_get_reports_all_period(client_with_auth, sample_tasks_for_reports):
    """Тест получения отчёта за всё время"""
    response = client_with_auth.get("/api/reports?period=all")

    assert response.status_code == 200
    data = response.json()

    # Проверяем структуру ответа
    assert "summary" in data
    assert "by_status" in data
    assert "by_priority" in data
    assert "by_day" in data
    assert "by_worker" in data

    # Проверяем summary
    summary = data["summary"]
    assert summary["total_tasks"] >= 0
    assert summary["completed_tasks"] >= 0
    assert summary["completion_rate"] >= 0
    assert summary["avg_tasks_per_day"] >= 0
    assert summary["period_days"] >= 0


def test_get_reports_month_period(client_with_auth):
    """Тест получения отчёта за месяц"""
    response = client_with_auth.get("/api/reports?period=month")

    assert response.status_code == 200
    data = response.json()

    assert "summary" in data
    assert "by_status" in data
    assert "by_priority" in data


def test_get_reports_week_period(client_with_auth):
    """Тест получения отчёта за неделю"""
    response = client_with_auth.get("/api/reports?period=week")

    assert response.status_code == 200
    data = response.json()

    summary = data["summary"]
    # За неделю должно быть не больше 7 дней
    assert summary["period_days"] <= 7


def test_get_reports_today(client_with_auth):
    """Тест получения отчёта за сегодня"""
    response = client_with_auth.get("/api/reports?period=today")

    assert response.status_code == 200
    data = response.json()

    summary = data["summary"]
    assert summary["period_days"] == 1


def test_get_reports_custom_period(client_with_auth):
    """Тест получения отчёта за кастомный период"""
    date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    date_to = datetime.now().strftime("%Y-%m-%d")

    response = client_with_auth.get(
        f"/api/reports?period=custom&date_from={date_from}&date_to={date_to}"
    )

    assert response.status_code == 200
    data = response.json()

    summary = data["summary"]
    assert summary["period_days"] >= 30


def test_get_reports_with_worker_filter(client_with_auth, sample_worker):
    """Тест получения отчёта с фильтром по работнику"""
    response = client_with_auth.get(
        f"/api/reports?period=month&worker_id={sample_worker['id']}"
    )

    assert response.status_code == 200
    data = response.json()

    # Если есть задачи у работника, они должны быть в отчёте
    if data["by_worker"]:
        # Проверяем что есть только один работник в статистике
        assert any(w["user_id"] == sample_worker["id"] for w in data["by_worker"])


def test_get_reports_by_status_structure(client_with_auth, sample_tasks_for_reports):
    """Тест структуры распределения по статусам"""
    response = client_with_auth.get("/api/reports?period=all")

    assert response.status_code == 200
    data = response.json()

    by_status = data["by_status"]
    assert isinstance(by_status, list)

    for item in by_status:
        assert "status" in item
        assert "count" in item
        assert "label" in item
        assert item["status"] in ["NEW", "IN_PROGRESS", "DONE", "CANCELLED"]
        assert item["count"] >= 0


def test_get_reports_by_priority_structure(client_with_auth, sample_tasks_for_reports):
    """Тест структуры распределения по приоритетам"""
    response = client_with_auth.get("/api/reports?period=all")

    assert response.status_code == 200
    data = response.json()

    by_priority = data["by_priority"]
    assert isinstance(by_priority, list)

    for item in by_priority:
        assert "priority" in item
        assert "count" in item
        assert "label" in item
        assert item["priority"] in ["EMERGENCY", "URGENT", "CURRENT", "PLANNED"]
        assert item["count"] >= 0


def test_get_reports_by_day_structure(client_with_auth, sample_tasks_for_reports):
    """Тест структуры динамики по дням"""
    response = client_with_auth.get("/api/reports?period=week")

    assert response.status_code == 200
    data = response.json()

    by_day = data["by_day"]
    assert isinstance(by_day, list)

    for item in by_day:
        assert "date" in item
        assert "created" in item
        assert "completed" in item
        assert item["created"] >= 0
        assert item["completed"] >= 0


def test_get_reports_by_worker_structure(client_with_auth, sample_tasks_for_reports):
    """Тест структуры статистики по работникам"""
    response = client_with_auth.get("/api/reports?period=all")

    assert response.status_code == 200
    data = response.json()

    by_worker = data["by_worker"]
    assert isinstance(by_worker, list)

    for item in by_worker:
        assert "user_id" in item
        assert "user_name" in item
        assert "total" in item
        assert "completed" in item
        assert "in_progress" in item
        assert "new_tasks" in item
        assert item["total"] >= 0


def test_get_reports_completion_time(client_with_auth, sample_completed_tasks):
    """Тест статистики времени выполнения"""
    response = client_with_auth.get("/api/reports?period=all")

    assert response.status_code == 200
    data = response.json()

    # Если есть завершённые задачи, должна быть статистика времени
    if data["summary"]["completed_tasks"] > 0:
        completion_time = data["completion_time"]
        if completion_time:
            assert "avg_hours" in completion_time
            assert "min_hours" in completion_time
            assert "max_hours" in completion_time
            assert "total_completed" in completion_time
            assert completion_time["avg_hours"] >= 0
            assert completion_time["min_hours"] >= 0
            assert completion_time["max_hours"] >= 0


def test_export_report_csv(client_with_auth):
    """Тест экспорта отчёта в CSV"""
    response = client_with_auth.get("/api/reports/export?period=month")

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]

    # Проверяем что это CSV
    content = response.text
    assert "ID" in content
    assert "Статус" in content or "Название" in content


def test_export_report_custom_period(client_with_auth):
    """Тест экспорта отчёта за кастомный период"""
    date_from = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    date_to = datetime.now().strftime("%Y-%m-%d")

    response = client_with_auth.get(
        f"/api/reports/export?period=custom&date_from={date_from}&date_to={date_to}"
    )

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]


def test_export_report_rejects_unsupported_format(client_with_auth):
    response = client_with_auth.get("/api/reports/export?period=month&format=pdf")

    assert response.status_code == 400
    assert "csv" in response.json()["detail"]


def test_reports_requires_auth(client):
    """Тест что Reports API требует авторизацию"""
    response = client.get("/api/reports?period=month")
    assert response.status_code == 401


def test_reports_dispatcher_access(client_with_dispatcher):
    """Тест что диспетчер может получать отчёты"""
    response = client_with_dispatcher.get("/api/reports?period=month")
    assert response.status_code == 200


def test_reports_worker_no_access(client_with_worker):
    """Тест что работник не может получать отчёты"""
    response = client_with_worker.get("/api/reports?period=month")
    # Должен вернуть 403 Forbidden (если используется get_current_dispatcher_or_admin)
    assert response.status_code in [403, 401]


def test_completion_rate_calculation(client_with_auth, sample_tasks_for_reports):
    """Тест правильности расчёта процента выполнения"""
    response = client_with_auth.get("/api/reports?period=all")

    assert response.status_code == 200
    data = response.json()

    summary = data["summary"]

    if summary["total_tasks"] > 0:
        expected_rate = (summary["completed_tasks"] / summary["total_tasks"]) * 100
        # Проверяем что completion_rate соответствует расчёту (с погрешностью 0.1%)
        assert abs(summary["completion_rate"] - expected_rate) < 0.1
    else:
        assert summary["completion_rate"] == 0


def test_avg_tasks_per_day_calculation(client_with_auth, sample_tasks_for_reports):
    """Тест правильности расчёта среднего количества задач в день"""
    response = client_with_auth.get("/api/reports?period=week")

    assert response.status_code == 200
    data = response.json()

    summary = data["summary"]

    if summary["period_days"] > 0:
        expected_avg = summary["total_tasks"] / summary["period_days"]
        # Проверяем с погрешностью
        assert abs(summary["avg_tasks_per_day"] - expected_avg) < 0.1


def test_reports_use_completed_at_for_completion_stats(
    client_with_auth, db_session, worker_user
):
    now = datetime.now()
    db_session.add(
        TaskModel(
            title="Edited after completion",
            description="Test",
            raw_address="Test address",
            status="DONE",
            priority="CURRENT",
            created_at=now - timedelta(days=10),
            completed_at=now - timedelta(days=9),
            updated_at=now - timedelta(days=1),
            assigned_user_id=worker_user.id,
        )
    )
    db_session.commit()

    response = client_with_auth.get("/api/reports?period=all")

    assert response.status_code == 200
    data = response.json()
    completion_days = {item["date"]: item["completed"] for item in data["by_day"]}

    assert completion_days[(now - timedelta(days=9)).strftime("%Y-%m-%d")] == 1
    assert completion_days.get((now - timedelta(days=1)).strftime("%Y-%m-%d"), 0) == 0
    assert data["completion_time"]["avg_hours"] == 24.0


def test_reports_worker_filter_limits_worker_rows(
    client_with_auth, db_session, worker_user
):
    extra_worker = UserModel(
        username="worker-extra",
        password_hash=get_password_hash("worker-extra"),
        full_name="Worker Extra",
        role=UserRole.WORKER.value,
        is_active=True,
    )
    db_session.add(extra_worker)
    db_session.add(
        TaskModel(
            title="Worker task",
            description="Test",
            raw_address="Test address",
            status="NEW",
            priority="CURRENT",
            created_at=datetime.now() - timedelta(days=1),
            updated_at=datetime.now() - timedelta(days=1),
            assigned_user_id=worker_user.id,
        )
    )
    db_session.commit()

    response = client_with_auth.get(
        f"/api/reports?period=all&worker_id={worker_user.id}"
    )

    assert response.status_code == 200
    assert response.json()["by_worker"] == [
        {
            "user_id": worker_user.id,
            "user_name": worker_user.full_name,
            "total": 1,
            "completed": 0,
            "in_progress": 0,
            "new_tasks": 1,
        }
    ]
