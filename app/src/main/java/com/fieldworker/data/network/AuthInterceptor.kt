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
 * При получении 401:
 * - Очищает токен авторизации
 * - Отправляет событие для автоматического выхода из аккаунта
 * 
 * Это обеспечивает автоматический редирект на экран логина,
 * когда токен истёк или стал невалидным.
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
        
        // Проверяем, является ли ответ 401 Unauthorized
        if (response.code == HTTP_UNAUTHORIZED) {
            Log.w(TAG, "Received 401 Unauthorized for ${request.url}")
            
            // Проверяем, был ли токен в запросе
            // Если токена не было, это просто неудачная попытка логина - не делаем logout
            val hadToken = request.header("Authorization") != null
            
            if (hadToken) {
                Log.w(TAG, "Token expired or invalid, triggering logout")
                // Отправляем событие логаута через AppPreferences
                appPreferences.triggerLogout()
            }
        }
        
        return response
    }
}
