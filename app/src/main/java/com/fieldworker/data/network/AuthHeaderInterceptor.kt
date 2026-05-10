package com.fieldworker.data.network

import com.fieldworker.data.preferences.AppPreferences
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Лёгкий интерцептор, добавляющий `Authorization: Bearer <token>` в запрос,
 * если заголовок ещё не задан вызывающей стороной. Используется в OkHttp клиенте
 * для Coil — чтобы картинки на защищённых эндпоинтах подгружались без ручного
 * проброса токена в каждый ImageRequest.
 *
 * В отличие от [AuthInterceptor], этот не реагирует на 401 и не инициирует logout —
 * для картинок ошибка 401 не должна разлогинивать пользователя.
 */
@Singleton
class AuthHeaderInterceptor @Inject constructor(
    private val prefs: AppPreferences,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header("Authorization") != null) {
            return chain.proceed(request)
        }
        val token = prefs.getAuthToken() ?: return chain.proceed(request)
        val authorized = request.newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        return chain.proceed(authorized)
    }
}
