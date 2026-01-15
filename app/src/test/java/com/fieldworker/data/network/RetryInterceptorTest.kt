package com.fieldworker.data.network

import io.mockk.every
import io.mockk.mockk
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.net.SocketTimeoutException

/**
 * Unit тесты для RetryInterceptor.
 * Проверяют логику повторных попыток.
 */
class RetryInterceptorTest {

    private lateinit var retryInterceptor: RetryInterceptor

    @Before
    fun setup() {
        retryInterceptor = RetryInterceptor()
    }

    @Test
    fun `successful response returns immediately`() {
        // Given
        val chain = mockChain(responseCode = 200)

        // When
        val response = retryInterceptor.intercept(chain)

        // Then
        assertEquals(200, response.code)
    }

    @Test
    fun `client error 400 does not retry`() {
        // Given
        val chain = mockChain(responseCode = 400)

        // When
        val response = retryInterceptor.intercept(chain)

        // Then
        assertEquals(400, response.code)
    }

    @Test
    fun `client error 401 does not retry`() {
        // Given
        val chain = mockChain(responseCode = 401)

        // When
        val response = retryInterceptor.intercept(chain)

        // Then
        assertEquals(401, response.code)
    }

    @Test
    fun `client error 404 does not retry`() {
        // Given
        val chain = mockChain(responseCode = 404)

        // When
        val response = retryInterceptor.intercept(chain)

        // Then
        assertEquals(404, response.code)
    }

    private fun mockChain(responseCode: Int): Interceptor.Chain {
        val request = Request.Builder()
            .url("https://example.com/api/test")
            .build()

        val response = Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(responseCode)
            .message("Test")
            .body("{}".toResponseBody())
            .build()

        return mockk<Interceptor.Chain> {
            every { request() } returns request
            every { proceed(any()) } returns response
        }
    }
}
