package com.fieldworker.data.network

import android.util.Log
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.remote.generated.RefreshRequest
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import java.io.IOException
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/**
 * OkHttp Authenticator для автоматического обновления JWT токена.
 * 
 * При получении 401 Unauthorized:
 * 1. Берёт refresh_token из AppPreferences
 * 2. Вызывает /api/auth/refresh для получения новой пары токенов
 * 3. Сохраняет новые токены и повторяет оригинальный запрос
 * 4. Если сервер отверг refresh (401) — вызывает logout; сбой связи — IOException
 * 
 * Использует отдельный OkHttpClient (без Authenticator) чтобы
 * избежать бесконечной рекурсии при вызове refresh.
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val appPreferences: AppPreferences,
    private val json: Json,
    @Named("refresh") private val refreshClient: OkHttpClient,
) : Authenticator {
    
    companion object {
        private const val TAG = "TokenAuthenticator"
        private const val MAX_REFRESH_RETRIES = 1
    }
    
    override fun authenticate(route: Route?, response: Response): Request? {
        Log.d(TAG, "authenticate() called for ${response.request.url}")
        
        // Не пытаемся рефрешить если запрос уже без токена (логин)
        val originalToken = response.request.header("Authorization")
        if (originalToken == null) {
            Log.d(TAG, "No Authorization header, skipping refresh")
            return null
        }
        
        // Защита от бесконечных попыток обновления
        val retryCount = response.request.header("X-Refresh-Retry")?.toIntOrNull() ?: 0
        if (retryCount >= MAX_REFRESH_RETRIES) {
            Log.w(TAG, "Max refresh retries ($MAX_REFRESH_RETRIES) reached, triggering logout")
            appPreferences.triggerLogout()
            return null
        }
        
        val refreshToken = appPreferences.getRefreshToken()
        if (refreshToken == null) {
            Log.w(TAG, "No refresh token available, triggering logout")
            appPreferences.triggerLogout()
            return null
        }
        
        // Синхронный вызов refresh (Authenticator работает синхронно)
        return synchronized(this) {
            // Проверяем: может другой поток уже обновил токен
            val currentToken = appPreferences.getAuthToken()
            val tokenFromRequest = originalToken.removePrefix("Bearer ")
            
            if (currentToken != null && currentToken != tokenFromRequest) {
                // Токен уже обновлён другим потоком — повторяем запрос с новым токеном
                Log.d(TAG, "Token already refreshed by another thread, retrying with new token")
                return@synchronized response.request.newBuilder()
                    .header("Authorization", "Bearer $currentToken")
                    .header("X-Refresh-Retry", (retryCount + 1).toString())
                    .build()
            }
            
            try {
                val newTokens = refreshTokenSync(refreshToken)
                // Пока запрос шёл, пользователь вышел или вошёл заново: ответ не должен
                // ни воскресить старую сессию, ни завершить новую.
                if (appPreferences.getRefreshToken() != refreshToken) throw IOException("Сессия изменена")
                if (newTokens != null) {
                    Log.d(TAG, "Token refresh successful, saving new tokens")
                    appPreferences.setAuthToken(newTokens.first)
                    appPreferences.setRefreshToken(newTokens.second)
                    
                    // Повторяем оригинальный запрос с новым access token
                    response.request.newBuilder()
                        .header("Authorization", "Bearer ${newTokens.first}")
                        .header("X-Refresh-Retry", (retryCount + 1).toString())
                        .build()
                } else {
                    Log.w(TAG, "Token refresh failed, triggering logout")
                    appPreferences.triggerLogout()
                    null
                }
            } catch (e: Exception) {
                // Сбой связи — не конец сессии: вызывающие видят ошибку сети (кеш,
                // офлайн-очередь), а не 401, по которому разлогинивают. Не-IOException
                // отсюда уронил бы поток OkHttp.
                Log.e(TAG, "Token refresh error: ${e.message}")
                throw e as? IOException ?: IOException("Не удалось обновить сессию", e)
            }
        }
    }
    
    /**
     * WebSocket: сервер отверг [rejectedToken] при рукопожатии (403 до accept) —
     * обычно access-токен истёк, пока приложение было в фоне без HTTP-запросов,
     * и Authenticator его не обновил. Обновляет пару, если этого ещё не сделал
     * другой поток. Не разлогинивает: фоновый сервис не должен выкидывать из
     * приложения из-за сбоя сети — это решит Authenticator на следующем запросе.
     */
    fun refreshRejectedToken(rejectedToken: String) {
        synchronized(this) {
            if (appPreferences.getAuthToken() != rejectedToken) return
            val refreshToken = appPreferences.getRefreshToken() ?: return
            val newTokens = try {
                refreshTokenSync(refreshToken)
            } catch (e: Exception) {
                Log.w(TAG, "WebSocket token refresh error: ${e.message}")
                null
            } ?: return
            if (appPreferences.getRefreshToken() != refreshToken) return // вышли, пока запрос шёл
            appPreferences.setAuthToken(newTokens.first)
            appPreferences.setRefreshToken(newTokens.second)
        }
    }

    /**
     * Синхронный вызов refresh token API.
     * Использует отдельный OkHttpClient без Authenticator.
     * @return Pair(accessToken, refreshToken) или null, если сервер отверг сессию (401)
     * @throws IOException сеть или любой другой ответ сервера — сессия может быть жива
     */
    private fun refreshTokenSync(refreshToken: String): Pair<String, String>? {
        val baseUrl = appPreferences.getFullServerUrl().let { url ->
            if (url.endsWith("/")) url else "$url/"
        }

        // Используем прямой HTTP-запрос (без Retrofit/Authenticator) для refresh.
        // Клиент общий (инжектится), не создаётся заново на каждый 401.
        val body = json.encodeToString(RefreshRequest(refreshToken))
        val request = Request.Builder()
            .url("${baseUrl}api/auth/refresh")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        refreshClient.newCall(request).execute().use { response ->
            if (response.isSuccessful) {
                val responseBody = response.body?.string()
                if (responseBody != null) {
                    val tokenResponse = json.decodeFromString<com.fieldworker.data.remote.generated.Token>(responseBody)
                    return Pair(tokenResponse.accessToken, tokenResponse.refreshToken)
                }
            }
            Log.w(TAG, "Refresh token API returned ${response.code}")
            if (response.code == 401) return null
            throw IOException("Не удалось обновить сессию: HTTP ${response.code}")
        }
    }
}
