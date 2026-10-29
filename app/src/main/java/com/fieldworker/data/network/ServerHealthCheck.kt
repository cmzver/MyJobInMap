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
    suspend fun isReachable(): Boolean = withContext(ioDispatcher) {
        try {
            val healthUrl = preferences.getFullServerUrl().trimEnd('/') + "/health"
            val connection = URL(healthUrl).openConnection() as HttpURLConnection
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.requestMethod = "GET"
            try {
                connection.connect()
                connection.responseCode == HttpURLConnection.HTTP_OK
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            false
        }
    }

    private companion object {
        const val TIMEOUT_MS = 3_000
    }
}
