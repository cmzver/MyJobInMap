"""Секреты из query не попадают в журнал uvicorn."""

import logging

from uvicorn.logging import AccessFormatter, DefaultFormatter

from app.utils.log_redaction import SecretRedactingFilter, install, redact

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkaXNwIn0.sig-Part_1"


def test_redact_masks_secret_params_only():
    assert redact(f"/ws?token={JWT}") == "/ws?token=***"
    assert (
        redact(f"/api/x?page=2&access_token={JWT}&q=a")
        == "/api/x?page=2&access_token=***&q=a"
    )
    assert redact("/api/tasks?page=2&tokens_total=5") == (
        "/api/tasks?page=2&tokens_total=5"
    )
    assert redact("/api/tasks?status=new") == "/api/tasks?status=new"


def _record(msg, args, name):
    return logging.LogRecord(name, logging.INFO, __file__, 1, msg, args, None)


def test_access_log_line_keeps_format_without_token():
    record = _record(
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", f"/api/files?token={JWT}", "1.1", 200),
        "uvicorn.access",
    )
    assert SecretRedactingFilter().filter(record)
    line = AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s')
    text = line.format(record)
    assert JWT not in text
    assert "/api/files?token=***" in text and "200" in text


def test_websocket_line_is_masked():
    record = _record(
        '%s - "WebSocket %s" [accepted]',
        ("172.18.0.1:34186", f"/ws?token={JWT}"),
        "uvicorn.error",
    )
    SecretRedactingFilter().filter(record)
    text = DefaultFormatter("%(message)s").format(record)
    assert text == '172.18.0.1:34186 - "WebSocket /ws?token=***" [accepted]'


def test_install_is_idempotent_and_applies_to_uvicorn_loggers(caplog):
    install()
    install()
    error_logger = logging.getLogger("uvicorn.error")
    assert sum(isinstance(f, SecretRedactingFilter) for f in error_logger.filters) == 1
    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        error_logger.info('%s - "WebSocket %s" [accepted]', "ip", f"/ws?token={JWT}")
    assert JWT not in caplog.text
    assert "/ws?token=***" in caplog.text


def _access_record(path, status):
    import logging

    return logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", path, "1.1", status),
        None,
    )


def test_successful_healthchecks_are_not_logged():
    from app.utils.log_redaction import QuietPathsFilter

    quiet = QuietPathsFilter()
    assert quiet.filter(_access_record("/health", 200)) is False
    assert quiet.filter(_access_record("/metrics?x=1", 200)) is False
    # Сбой проверки здоровья и обычные запросы — остаются
    assert quiet.filter(_access_record("/health", 503)) is True
    assert quiet.filter(_access_record("/api/tasks", 200)) is True
