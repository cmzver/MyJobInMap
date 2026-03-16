package com.fieldworker.data.network

import android.util.Log
import com.fieldworker.data.preferences.AppPreferences
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Интерцептор для обработки 401 Unauthorized ответов.
 * 
 * Работает совместно с TokenAuthenticator:
 * 1. TokenAuthenticator автоматически обновляет токен при 401
 * 2. AuthInterceptor обрабатывает случаи, когда refresh тоже не помог
 *    (финальный 401 после попытки refresh)
 * 
 * Если запрос имеет заголовок X-Refresh-Retry — значит это повторная попытка
 * после refresh, и если снова 401, нужно разлогинить.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val appPreferences: AppPreferences
) : Interceptor {
    
    companion object {
        private const val TAG = "AuthInterceptor"
        private const val HTTP_UNAUTHORIZED = 401
    }
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)
        
        // Проверяем 401 только если это запрос ПОСЛЕ refresh retry
        // Если X-Refresh-Retry есть, значит Authenticator уже пытался обновить токен
        if (response.code == HTTP_UNAUTHORIZED) {
            val hadToken = request.header("Authorization") != null
            val wasRetry = request.header("X-Refresh-Retry") != null
            
            if (hadToken && wasRetry) {
                Log.w(TAG, "401 after token refresh retry, forcing logout")
                appPreferences.triggerLogout()
            }
        }
        
        return response
    }
}
