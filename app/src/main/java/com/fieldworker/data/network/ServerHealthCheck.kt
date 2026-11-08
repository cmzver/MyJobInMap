package com.fieldworker.data.network

import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Отвечает ли сервер: GET /health с коротким таймаутом. «Есть сеть»
 * ([NetworkMonitor]) ещё не значит «сервер доступен» — офлайн-режим
 * приложения решается здесь. Отдельный класс, чтобы юнит-тесты задавали
 * доступность сервера сами, а не зависели от настоящей сети.
 */
@Singleton
class ServerHealthCheck @Inject constructor(
    private val preferences: AppPreferences,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    @Volatile
    private var lastResult: Boolean? = null

    /**
     * Итог последней проверки (null — ещё не проверяли). По нему правки без
     * ответа сервера сразу уходят в очередь, а не ждут таймаут запроса.
     */
    val lastKnownReachable: Boolean?
        get() = lastResult

    suspend fun isReachable(): Boolean = withContext(ioDispatcher) {
        val reachable = try {
            get(preferences.getFullServerUrl(), TIMEOUT_MS)
        } catch (_: Exception) {
            false
        }
        reachable.also { lastResult = it }
    }

    /**
     * Ручная проверка адреса из настроек («Проверить подключение»). Ошибка
     * соединения летит наружу — по ней пользователю пишут понятную причину.
     * На [lastKnownReachable] не влияет: адрес ещё не сохранён.
     */
    suspend fun probe(baseUrl: String): Boolean = withContext(ioDispatcher) {
        get(baseUrl, MANUAL_TIMEOUT_MS)
    }

    private fun get(baseUrl: String, timeoutMs: Int): Boolean {
        val base = baseUrl.trimEnd('/')
        val healthUrl = if (base.endsWith("/health")) base else "$base/health"
        val connection = URL(healthUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = timeoutMs
        connection.readTimeout = timeoutMs
        connection.requestMethod = "GET"
        return try {
            connection.connect()
            connection.responseCode == HttpURLConnection.HTTP_OK
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val TIMEOUT_MS = 3_000

        // Пользователь сам ждёт ответа — даём медленной сети больше времени
        const val MANUAL_TIMEOUT_MS = 5_000
    }
}
