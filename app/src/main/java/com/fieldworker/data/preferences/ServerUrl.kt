package com.fieldworker.data.preferences

/**
 * Адрес сервера из того, что ввёл пользователь: одна сборка для запросов,
 * кнопок «Проверить» и подписи в настройках, чтобы они не расходились.
 */
object ServerUrl {

    /**
     * Полный адрес без завершающего «/». Без схемы — http:// (как и подсказывает
     * поле порта). Для http без порта дописывается [port]; для https — нет:
     * сервер за Caddy на стандартном 443. Пустой ввод — пустая строка.
     */
    fun build(rawUrl: String, port: Int): String {
        val trimmed = rawUrl.trim().trimEnd('/')
        if (trimmed.isEmpty()) return ""
        val url = if (trimmed.contains("://")) trimmed else "http://$trimmed"
        val scheme = url.substringBefore("://")
        val host = url.substringAfter("://").substringBefore('/')
        val path = url.substringAfter("://").removePrefix(host)
        return when {
            host.contains(":") -> url
            scheme.equals("https", ignoreCase = true) -> url
            else -> "$scheme://$host:$port$path"
        }
    }
}
