"""Значение, которое БД не принимает (PostgreSQL DataError), — 422 по-русски, не 500."""

import pytest
from sqlalchemy.exc import DataError

from app.api.deps import get_task_or_404
from main import app


class _PgError(Exception):
    def __init__(self, pgcode):
        super().__init__("integer out of range")
        self.pgcode = pgcode


@pytest.mark.parametrize(
    "pgcode, text",
    [
        ("22003", "Число вне допустимого диапазона"),
        ("22001", "Слишком длинное значение"),
        (None, "Недопустимое значение в запросе"),
    ],
)
def test_data_error_becomes_422(client_with_auth, pgcode, text):
    def out_of_range(task_id: int):
        raise DataError(
            "SELECT ... WHERE tasks.id = %(id)s", {"id": task_id}, _PgError(pgcode)
        )

    app.dependency_overrides[get_task_or_404] = out_of_range
    try:
        response = client_with_auth.get("/api/tasks/99999999999")
    finally:
        app.dependency_overrides.pop(get_task_or_404, None)

    assert response.status_code == 422
    assert response.json()["detail"] == text
