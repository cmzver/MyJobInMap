package com.fieldworker.data.network

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import retrofit2.HttpException
import java.net.SocketException
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
     * Сервер не отвечает: соединение отклонено или оборвано
     * (ConnectException «Failed to connect to …» и прочие SocketException)
     */
    data object Unreachable : NetworkError() {
        private fun readResolve(): Any = Unreachable
        override val message: String = "Сервер недоступен. Проверьте подключение"
    }

    /**
     * Ответ сервера не удалось разобрать
     */
    data object BadResponse : NetworkError() {
        private fun readResolve(): Any = BadResponse
        override val message: String = "Неожиданный ответ сервера. Попробуйте позже"
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
                is SocketException -> Unreachable
                is SerializationException -> BadResponse
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
                409 -> Unknown("Данные уже изменились. Обновите и попробуйте снова")
                413 -> Unknown("Файл слишком большой")
                422 -> Unknown("Проверьте введённые данные")
                429 -> Unknown("Слишком много запросов. Попробуйте позже")
                in 500..599 -> ServerError(code)
                else -> Unknown("Не удалось выполнить запрос (код $code)")
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
 * Понятное пользователю сообщение об ошибке.
 *
 * Для ответа сервера 4xx берётся его собственный текст (`detail` или `error`:
 * сервер пишет их по-русски), иначе — текст по коду. Сетевые исключения
 * («Unable to resolve host…», «Failed to connect…») наружу не показываются.
 * [fallback] — если у исключения нет ни типа, ни сообщения.
 */
fun Throwable.toUserMessage(fallback: String = "Неизвестная ошибка"): String {
    return when (this) {
        is NetworkError -> this.message ?: fallback
        is UnknownHostException -> NetworkError.NoConnection.message
        is SocketTimeoutException -> NetworkError.Timeout.message
        is SSLException -> NetworkError.SSLError.message
        is SocketException -> NetworkError.Unreachable.message
        is SerializationException -> NetworkError.BadResponse.message
        is HttpException -> serverMessage(this)
            ?: NetworkError.fromHttpCode(this.code()).message
            ?: fallback
        else -> this.message?.takeIf { it.isNotBlank() } ?: fallback
    }
}

private val errorJson = Json { ignoreUnknownKeys = true }

/** Текст сервера из тела ответа: `detail` (строка) или `error`. */
private fun serverMessage(error: HttpException): String? {
    if (error.code() == 401 || error.code() >= 500) return null
    val body = runCatching { error.response()?.errorBody()?.string() }.getOrNull()
    if (body.isNullOrBlank()) return null
    val root = runCatching { errorJson.parseToJsonElement(body).jsonObject }.getOrNull()
        ?: return null
    return listOf("detail", "error").firstNotNullOfOrNull { key ->
        (root[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() }
    }
}
