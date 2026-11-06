"""Ошибки валидации Pydantic — по-русски.

Pydantic отдаёт ``msg`` по-английски («Field required», «String should have
at least 3 characters»); портал и приложение показывают текст ответа как
есть. Здесь — перевод по ``type`` ошибки с подстановкой ограничений из ``ctx``.
"""

from typing import Any, Dict, Iterable, List

# Части loc, которые пользователю ничего не говорят.
_LOC_SOURCES = {"body", "query", "path", "header", "cookie", "form"}

_SIMPLE = {
    "missing": "обязательное поле",
    "string_type": "ожидается текст",
    "int_type": "ожидается целое число",
    "int_parsing": "ожидается целое число",
    "int_from_float": "ожидается целое число",
    "float_type": "ожидается число",
    "float_parsing": "ожидается число",
    "decimal_parsing": "ожидается число",
    "decimal_type": "ожидается число",
    "bool_type": "ожидается да/нет",
    "bool_parsing": "ожидается да/нет",
    "date_type": "ожидается дата",
    "date_parsing": "неверная дата",
    "date_from_datetime_parsing": "неверная дата",
    "datetime_type": "ожидаются дата и время",
    "datetime_parsing": "неверные дата и время",
    "datetime_from_date_parsing": "неверные дата и время",
    "time_parsing": "неверное время",
    "list_type": "ожидается список",
    "dict_type": "ожидается объект",
    "model_type": "ожидается объект",
    "model_attributes_type": "ожидается объект",
    "json_invalid": "некорректный JSON",
    "json_type": "некорректный JSON",
    "uuid_parsing": "неверный идентификатор",
    "url_parsing": "неверная ссылка",
    "url_type": "неверная ссылка",
    "value_error.email": "неверный адрес почты",
    "extra_forbidden": "лишнее поле",
    "string_unicode": "недопустимые символы",
    "finite_number": "ожидается конечное число",
}


def _ctx_format(template: str, ctx: Dict[str, Any], *keys: str) -> str:
    values = [ctx.get(key) for key in keys]
    if any(value is None for value in values):
        return ""
    return template.format(*values)


def message_for(error: Dict[str, Any]) -> str:
    """Человекочитаемая причина одной ошибки (без названия поля)."""
    kind = str(error.get("type") or "")
    ctx = error.get("ctx") or {}
    msg = str(error.get("msg") or "")

    if kind in _SIMPLE:
        return _SIMPLE[kind]
    if kind == "string_too_short":
        return _ctx_format("слишком короткое значение (минимум {})", ctx, "min_length")
    if kind == "string_too_long":
        return _ctx_format("слишком длинное значение (максимум {})", ctx, "max_length")
    if kind == "too_short":
        return _ctx_format("слишком мало элементов (минимум {})", ctx, "min_length")
    if kind == "too_long":
        return _ctx_format("слишком много элементов (максимум {})", ctx, "max_length")
    if kind == "greater_than":
        return _ctx_format("должно быть больше {}", ctx, "gt")
    if kind == "greater_than_equal":
        return _ctx_format("должно быть не меньше {}", ctx, "ge")
    if kind == "less_than":
        return _ctx_format("должно быть меньше {}", ctx, "lt")
    if kind == "less_than_equal":
        return _ctx_format("должно быть не больше {}", ctx, "le")
    if kind == "string_pattern_mismatch":
        return "неверный формат"
    if kind in ("enum", "literal_error"):
        expected = ctx.get("expected")
        return (
            f"допустимые значения: {expected}" if expected else "недопустимое значение"
        )
    if kind in ("value_error", "assertion_error"):
        # Свои валидаторы проекта пишут сообщение по-русски — оставляем его.
        for prefix in ("Value error, ", "Assertion failed, "):
            if msg.startswith(prefix):
                return msg[len(prefix) :]
        return msg
    return msg


def field_label(loc: Iterable[Any]) -> str:
    parts = [str(part) for part in loc]
    if parts and parts[0] in _LOC_SOURCES:
        parts = parts[1:]
    return ".".join(parts)


def humanize(errors: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    return [
        {
            "field": field_label(error.get("loc") or ()),
            "message": message_for(error) or str(error.get("msg") or ""),
            "type": str(error.get("type") or ""),
        }
        for error in errors
    ]


def summary(items: List[Dict[str, str]]) -> str:
    """Строка для ``error``: первая причина с полем, остальные — числом."""
    if not items:
        return "Ошибка валидации"
    first = items[0]
    text = (
        f"Поле «{first['field']}»: {first['message']}"
        if first["field"]
        else first["message"]
    )
    if len(items) > 1:
        text += f" (и ещё ошибок: {len(items) - 1})"
    return text
