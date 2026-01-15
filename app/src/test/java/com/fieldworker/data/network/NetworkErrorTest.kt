package com.fieldworker.data.network

import org.junit.Assert.*
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Unit тесты для NetworkError.
 * Проверяют корректное преобразование исключений.
 */
class NetworkErrorTest {

    @Test
    fun `UnknownHostException maps to NoConnection`() {
        // Given
        val exception = UnknownHostException("Unable to resolve host")

        // When
        val error = NetworkError.from(exception)

        // Then
        assertTrue(error is NetworkError.NoConnection)
        assertEquals("Нет подключения к интернету", error.message)
    }

    @Test
    fun `SocketTimeoutException maps to Timeout`() {
        // Given
        val exception = SocketTimeoutException("Connection timed out")

        // When
        val error = NetworkError.from(exception)

        // Then
        assertTrue(error is NetworkError.Timeout)
        assertEquals("Превышено время ожидания ответа сервера", error.message)
    }

    @Test
    fun `SSLException maps to SSLError`() {
        // Given
        val exception = SSLException("Certificate error")

        // When
        val error = NetworkError.from(exception)

        // Then
        assertTrue(error is NetworkError.SSLError)
        assertEquals("Ошибка безопасного соединения", error.message)
    }

    @Test
    fun `HTTP 401 maps to Unauthorized`() {
        // When
        val error = NetworkError.fromHttpCode(401)

        // Then
        assertTrue(error is NetworkError.Unauthorized)
        assertEquals("Сессия истекла. Войдите заново", error.message)
    }

    @Test
    fun `HTTP 403 maps to Forbidden`() {
        // When
        val error = NetworkError.fromHttpCode(403)

        // Then
        assertTrue(error is NetworkError.Forbidden)
        assertEquals("Доступ запрещён", error.message)
    }

    @Test
    fun `HTTP 404 maps to NotFound`() {
        // When
        val error = NetworkError.fromHttpCode(404)

        // Then
        assertTrue(error is NetworkError.NotFound)
        assertEquals("Данные не найдены", error.message)
    }

    @Test
    fun `HTTP 500 maps to ServerError`() {
        // When
        val error = NetworkError.fromHttpCode(500)

        // Then
        assertTrue(error is NetworkError.ServerError)
        assertEquals("Ошибка сервера (500). Попробуйте позже", error.message)
    }

    @Test
    fun `HTTP 503 maps to ServerError`() {
        // When
        val error = NetworkError.fromHttpCode(503)

        // Then
        assertTrue(error is NetworkError.ServerError)
        assertEquals("Ошибка сервера (503). Попробуйте позже", error.message)
    }

    @Test
    fun `Unknown exception maps to Unknown error`() {
        // Given
        val exception = RuntimeException("Something went wrong")

        // When
        val error = NetworkError.from(exception)

        // Then
        assertTrue(error is NetworkError.Unknown)
        assertEquals("Something went wrong", error.message)
    }

    @Test
    fun `toUserMessage returns correct message for UnknownHostException`() {
        // Given
        val exception = UnknownHostException("Unable to resolve host")

        // When
        val message = exception.toUserMessage()

        // Then
        assertEquals("Нет подключения к интернету", message)
    }

    @Test
    fun `toUserMessage returns correct message for SocketTimeoutException`() {
        // Given
        val exception = SocketTimeoutException("Timeout")

        // When
        val message = exception.toUserMessage()

        // Then
        assertEquals("Превышено время ожидания ответа сервера", message)
    }

    @Test
    fun `toUserMessage returns original message for unknown exception`() {
        // Given
        val exception = RuntimeException("Custom error message")

        // When
        val message = exception.toUserMessage()

        // Then
        assertEquals("Custom error message", message)
    }
}
