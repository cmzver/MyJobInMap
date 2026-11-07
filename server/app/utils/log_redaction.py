"""Маскирование секретов в строках журнала.

Uvicorn пишет путь запроса целиком, вместе с query: WebSocket подключается
как ``/ws?token=<JWT>``, и действующий токен оказывался в ``docker logs``.
Фильтр вешается на логгеры uvicorn и заменяет значения секретных параметров.
"""

import logging
import re

SECRET_PARAMS = ("token", "access_token", "refresh_token", "password", "secret")

_SECRET_QUERY = re.compile(
    r"(?P<key>[?&](?:" + "|".join(SECRET_PARAMS) + r")=)[^&\s\"']+",
    re.IGNORECASE,
)

MASK = "***"

# uvicorn.error пишет строки WebSocket ("WebSocket /ws?token=…" [accepted]),
# uvicorn.access — обычные HTTP-запросы.
UVICORN_LOGGERS = ("uvicorn.access", "uvicorn.error")


def redact(text: str) -> str:
    return _SECRET_QUERY.sub(lambda m: m.group("key") + MASK, text)


def _clean(value):
    return redact(value) if isinstance(value, str) else value


class SecretRedactingFilter(logging.Filter):
    """Чистит аргументы записи, не трогая формат: AccessFormatter uvicorn
    раскладывает ``record.args`` по полям (адрес, метод, путь, код)."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(_clean(arg) for arg in record.args)
        elif isinstance(record.args, dict):
            record.args = {key: _clean(arg) for key, arg in record.args.items()}
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        return True


# Служебные запросы: healthcheck Docker раз в 30 с и сбор метрик — шум
QUIET_PATHS = ("/health", "/metrics")


class QuietPathsFilter(logging.Filter):
    """Убирает из журнала доступа успешные служебные запросы.

    AccessFormatter uvicorn получает args (адрес, метод, путь, версия, код).
    Ошибочные ответы (не 2xx/3xx) остаются — они как раз интересны.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 5:
            path, status = str(args[2]).split("?", 1)[0], args[4]
            if path in QUIET_PATHS and isinstance(status, int) and status < 400:
                return False
        return True


def install(logger_names=UVICORN_LOGGERS) -> None:
    """Повторный вызов не добавляет второй экземпляр фильтра."""
    for name in logger_names:
        target = logging.getLogger(name)
        if not any(isinstance(f, SecretRedactingFilter) for f in target.filters):
            target.addFilter(SecretRedactingFilter())
    access = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, QuietPathsFilter) for f in access.filters):
        access.addFilter(QuietPathsFilter())
