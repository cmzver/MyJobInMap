package com.fieldworker.data.network

private val SECRET_QUERY = Regex(
    """([?&](?:token|access_token|refresh_token|password)=)[^&\s"']+""",
    RegexOption.IGNORE_CASE,
)

/**
 * Маскирует секреты в строке лога: WebSocket подключается как
 * `/ws?token=<JWT>`, и OkHttp-логгер писал действующий токен в logcat.
 */
fun redactSecrets(message: String): String = SECRET_QUERY.replace(message, "$1***")
