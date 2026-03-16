package com.fieldworker.data.network

import android.util.Log
import com.fieldworker.data.preferences.AppPreferences
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OkHttp Authenticator для автоматического обновления JWT токена.
 * 
 * При получении 401 Unauthorized:
 * 1. Берёт refresh_token из AppPreferences
 * 2. Вызывает /api/auth/refresh для получения новой пары токенов
 * 3. Сохраняет новые токены и повторяет оригинальный запрос
 * 4. Если refresh не удался — вызывает logout
 * 
 * Использует отдельный OkHttpClient (без Authenticator) чтобы
 * избежать бесконечной рекурсии при вызове refresh.
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val appPreferences: AppPreferences
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
                Log.e(TAG, "Token refresh error: ${e.message}")
                appPreferences.triggerLogout()
                null
            }
        }
    }
    
    /**
     * Синхронный вызов refresh token API.
     * Использует отдельный OkHttpClient без Authenticator.
     * @return Pair(accessToken, refreshToken) или null
     */
    private fun refreshTokenSync(refreshToken: String): Pair<String, String>? {
        val baseUrl = appPreferences.getFullServerUrl().let { url ->
            if (url.endsWith("/")) url else "$url/"
        }
        
        val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()
        
        // Используем прямой HTTP-запрос (без Retrofit/Authenticator) для refresh
        val request = Request.Builder()
            .url("${baseUrl}api/auth/refresh")
            .post(
                """{"refresh_token":"$refreshToken"}"""
                    .toRequestBody("application/json".toMediaType())
            )
            .build()
        
        val response = client.newCall(request).execute()
        
        if (response.isSuccessful) {
            val body = response.body?.string()
            if (body != null) {
                val gson = com.google.gson.Gson()
                val tokenResponse = gson.fromJson(body, com.fieldworker.data.dto.TokenResponse::class.java)
                return Pair(tokenResponse.accessToken, tokenResponse.refreshToken)
            }
        }
        
        Log.w(TAG, "Refresh token API returned ${response.code}")
        return null
    }
}
