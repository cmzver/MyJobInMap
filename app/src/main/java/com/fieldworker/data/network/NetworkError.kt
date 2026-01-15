package com.fieldworker.data.network

import retrofit2.HttpException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Sealed class для типизированных сетевых ошибок.
 */
sealed class NetworkError : Exception() {
    
    /**
     * Нет подключения к интернету
     */
    data object NoConnection : NetworkError() {
        private fun readResolve(): Any = NoConnection
        override val message: String = "Нет подключения к интернету"
    }
    
    /**
     * Таймаут соединения
     */
    data object Timeout : NetworkError() {
        private fun readResolve(): Any = Timeout
        override val message: String = "Превышено время ожидания ответа сервера"
    }
    
    /**
     * Ошибка сервера (5xx)
     */
    data class ServerError(val code: Int) : NetworkError() {
        override val message: String = "Ошибка сервера ($code). Попробуйте позже"
    }
    
    /**
     * Не авторизован (401)
     */
    data object Unauthorized : NetworkError() {
        private fun readResolve(): Any = Unauthorized
        override val message: String = "Сессия истекла. Войдите заново"
    }
    
    /**
     * Доступ запрещён (403)
     */
    data object Forbidden : NetworkError() {
        private fun readResolve(): Any = Forbidden
        override val message: String = "Доступ запрещён"
    }
    
    /**
     * Ресурс не найден (404)
     */
    data object NotFound : NetworkError() {
        private fun readResolve(): Any = NotFound
        override val message: String = "Данные не найдены"
    }
    
    /**
     * Ошибка SSL/TLS
     */
    data object SSLError : NetworkError() {
        private fun readResolve(): Any = SSLError
        override val message: String = "Ошибка безопасного соединения"
    }
    
    /**
     * Неизвестная ошибка
     */
    data class Unknown(override val message: String) : NetworkError()
    
    companion object {
        /**
         * Преобразовать исключение в типизированную ошибку
         */
        fun from(throwable: Throwable): NetworkError {
            return when (throwable) {
                is UnknownHostException -> NoConnection
                is SocketTimeoutException -> Timeout
                is SSLException -> SSLError
                is HttpException -> fromHttpCode(throwable.code())
                is NetworkError -> throwable
                else -> Unknown(throwable.message ?: "Неизвестная ошибка")
            }
        }
        
        /**
         * Преобразовать HTTP код в типизированную ошибку
         */
        fun fromHttpCode(code: Int): NetworkError {
            return when (code) {
                401 -> Unauthorized
                403 -> Forbidden
                404 -> NotFound
                in 500..599 -> ServerError(code)
                else -> Unknown("HTTP ошибка: $code")
            }
        }
    }
}

/**
 * Extension для Result с обработкой сетевых ошибок
 */
fun <T> Result<T>.mapNetworkError(): Result<T> {
    return this.mapCatching { it }
        .recoverCatching { throw NetworkError.from(it) }
}

/**
 * Extension для получения понятного сообщения об ошибке
 */
fun Throwable.toUserMessage(): String {
    return when (this) {
        is NetworkError -> this.message ?: "Ошибка сети"
        is UnknownHostException -> NetworkError.NoConnection.message!!
        is SocketTimeoutException -> NetworkError.Timeout.message!!
        is SSLException -> NetworkError.SSLError.message!!
        is HttpException -> NetworkError.fromHttpCode(this.code()).message ?: "Ошибка HTTP"
        else -> this.message ?: "Неизвестная ошибка"
    }
}
