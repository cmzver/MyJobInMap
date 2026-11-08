"""Ошибки валидации 422 — по-русски и с названием поля."""

from app.utils.validation_messages import field_label, humanize, message_for, summary


def test_known_types_are_translated():
    assert message_for({"type": "missing", "msg": "Field required"}) == (
        "обязательное поле"
    )
    assert (
        message_for(
            {
                "type": "string_too_short",
                "msg": "String should have at least 3 characters",
                "ctx": {"min_length": 3},
            }
        )
        == "слишком короткое значение (минимум 3)"
    )
    assert (
        message_for({"type": "less_than_equal", "msg": "...", "ctx": {"le": 100}})
        == "должно быть не больше 100"
    )


def test_custom_value_error_keeps_project_message():
    error = {"type": "value_error", "msg": "Value error, Неверный формат телефона"}
    assert message_for(error) == "Неверный формат телефона"


def test_unknown_type_falls_back_to_russian():
    assert message_for({"type": "something_new", "msg": "Оригинал"}) == "Оригинал"
    assert message_for({"type": "something_new", "msg": "Original"}) == (
        "неверное значение"
    )
    # Свой ValueError, даже если pydantic завернул его в другой тип.
    assert message_for({"type": "x", "msg": "Value error, Не тот номер"}) == (
        "Не тот номер"
    )


def test_enum_and_numbers_are_russian():
    assert (
        message_for(
            {"type": "enum", "msg": "...", "ctx": {"expected": "'a', 'b' or 'c'"}}
        )
        == "допустимые значения: 'a', 'b' или 'c'"
    )
    assert (
        message_for({"type": "greater_than", "msg": "...", "ctx": {"gt": 0}})
        == "должно быть больше 0"
    )
    assert message_for({"type": "int_parsing", "msg": "Input should"}) == (
        "ожидается целое число"
    )
    assert (
        message_for(
            {"type": "string_too_long", "msg": "...", "ctx": {"max_length": 200}}
        )
        == "слишком длинное значение (максимум 200)"
    )


def test_api_422_keeps_client_format(client_with_auth):
    """Формат, который разбирают портал (apiError.ts) и Android (NetworkError.kt):
    строка ``error`` и список ``details`` — без английских фраз pydantic."""
    response = client_with_auth.get("/api/tasks", params={"page": "abc"})
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"error", "details", "request_id"}
    assert body["error"] == "Поле «page»: ожидается целое число"
    assert body["details"][0] == {
        "field": "page",
        "message": "ожидается целое число",
        "type": "int_parsing",
    }


def test_field_label_drops_location_source():
    assert field_label(("body", "title")) == "title"
    assert field_label(("query", "page")) == "page"
    assert field_label(("body", "items", 0, "qty")) == "items.0.qty"


def test_summary_mentions_first_field_and_rest_count():
    items = humanize(
        [
            {"loc": ("body", "title"), "type": "missing", "msg": "Field required"},
            {"loc": ("body", "address"), "type": "missing", "msg": "Field required"},
        ]
    )
    assert summary(items) == "Поле «title»: обязательное поле (и ещё ошибок: 1)"
    assert summary([]) == "Ошибка валидации"


def test_api_422_is_readable(client_with_auth):
    response = client_with_auth.post("/api/tasks", json={"description": "x"})
    assert response.status_code == 422
    body = response.json()
    assert body["error"].startswith("Поле «")
    assert "обязательное поле" in body["error"]
    fields = {item["field"] for item in body["details"]}
    assert "title" in fields
    assert all("Field required" not in item["message"] for item in body["details"])


def test_permission_403_is_in_russian(client_with_worker):
    """Отказ по праву без своего текста — тоже по-русски, а не «Permission denied»."""
    response = client_with_worker.delete("/api/tasks/1")
    assert response.status_code == 403
    assert response.json()["detail"] == "Недостаточно прав для этого действия"
