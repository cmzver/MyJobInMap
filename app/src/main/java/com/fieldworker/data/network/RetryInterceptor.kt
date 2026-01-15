package com.fieldworker.data.network

import android.util.Log
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Interceptor для автоматического повтора неудачных запросов.
 * 
 * Стратегия:
 * - До 3 попыток для сетевых ошибок
 * - Экспоненциальная задержка между попытками
 * - Не повторяем при ошибках авторизации (401, 403)
 */
@Singleton
class RetryInterceptor @Inject constructor() : Interceptor {
    
    companion object {
        private const val TAG = "RetryInterceptor"
        private const val MAX_RETRIES = 3
        private const val INITIAL_DELAY_MS = 1000L
    }
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        var lastException: IOException? = null
        
        repeat(MAX_RETRIES) { attempt ->
            try {
                val response = chain.proceed(request)
                
                // Успешный ответ или клиентская ошибка - не повторяем
                if (response.isSuccessful || response.code in 400..499) {
                    return response
                }
                
                // Серверные ошибки (5xx) - повторяем
                if (response.code in 500..599 && attempt < MAX_RETRIES - 1) {
                    response.close()
                    Log.w(TAG, "Server error ${response.code}, retry ${attempt + 1}/$MAX_RETRIES")
                    Thread.sleep(calculateDelay(attempt))
                } else {
                    return response
                }
            } catch (e: SocketTimeoutException) {
                lastException = e
                Log.w(TAG, "Timeout, retry ${attempt + 1}/$MAX_RETRIES")
                if (attempt < MAX_RETRIES - 1) {
                    Thread.sleep(calculateDelay(attempt))
                }
            } catch (e: UnknownHostException) {
                // Нет сети - не повторяем
                throw e
            } catch (e: IOException) {
                lastException = e
                Log.w(TAG, "IO error: ${e.message}, retry ${attempt + 1}/$MAX_RETRIES")
                if (attempt < MAX_RETRIES - 1) {
                    Thread.sleep(calculateDelay(attempt))
                }
            }
        }
        
        throw lastException ?: IOException("Unknown error after $MAX_RETRIES retries")
    }
    
    /**
     * Экспоненциальная задержка: 1s, 2s, 4s...
     */
    private fun calculateDelay(attempt: Int): Long {
        return INITIAL_DELAY_MS * (1 shl attempt)
    }
}
