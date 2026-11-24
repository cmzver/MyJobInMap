package com.fieldworker.data.network

import com.fieldworker.data.preferences.AppPreferences
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException

/** Обновление токена после отказа WebSocket-рукопожатия. */
class TokenAuthenticatorTest {

    private val prefs = mockk<AppPreferences>(relaxed = true) {
        every { getFullServerUrl() } returns "https://example.test"
        every { getRefreshToken() } returns "refresh-1"
    }
    private val refreshClient = mockk<OkHttpClient>()
    private val authenticator = TokenAuthenticator(prefs, Json { ignoreUnknownKeys = true }, refreshClient)

    private fun refreshAnswers(block: (Request) -> Response) {
        every { refreshClient.newCall(any()) } answers {
            val request = firstArg<Request>()
            mockk<Call> { every { execute() } answers { block(request) } }
        }
    }

    private fun ok(request: Request) = Response.Builder()
        .request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
        .body(("""{"access_token":"fresh","refresh_token":"refresh-2","token_type":"bearer",""" +
            """"user_id":1,"username":"w","role":"worker","full_name":"W"}""")
            .toResponseBody("application/json".toMediaType()))
        .build()

    @Test
    fun `отвергнутый токен обновляется и сохраняется`() {
        every { prefs.getAuthToken() } returns "stale"
        refreshAnswers(::ok)

        authenticator.refreshRejectedToken("stale")

        verify { prefs.setAuthToken("fresh") }
        verify { prefs.setRefreshToken("refresh-2") }
    }

    @Test
    fun `токен уже обновил другой поток — повторного refresh нет`() {
        every { prefs.getAuthToken() } returns "fresh"

        authenticator.refreshRejectedToken("stale")

        verify(exactly = 0) { refreshClient.newCall(any()) }
    }

    @Test
    fun `сбой сети при refresh не разлогинивает`() {
        every { prefs.getAuthToken() } returns "stale"
        refreshAnswers { throw IOException("offline") }

        authenticator.refreshRejectedToken("stale")

        verify(exactly = 0) { prefs.triggerLogout() }
        verify(exactly = 0) { prefs.setAuthToken(any()) }
    }

    private fun unauthorized() = Response.Builder()
        .request(Request.Builder().url("https://example.test/api/tasks")
            .header("Authorization", "Bearer stale").build())
        .protocol(Protocol.HTTP_1_1).code(401).message("Unauthorized")
        .build()

    private fun status(code: Int): (Request) -> Response = { request ->
        ok(request).newBuilder().code(code).message("").build()
    }

    @Test
    fun `401 от refresh — сессия закончилась, выход`() {
        every { prefs.getAuthToken() } returns "stale"
        refreshAnswers(status(401))

        assertNull(authenticator.authenticate(null, unauthorized()))

        verify { prefs.triggerLogout() }
    }

    @Test
    fun `сбой связи, 5xx и чужой ответ при refresh — ошибка сети, не выход`() {
        every { prefs.getAuthToken() } returns "stale"
        val failures = listOf<(Request) -> Response>(
            { throw IOException("offline") },
            status(503),
            { ok(it).newBuilder().body("<html>".toResponseBody()).build() },
        )

        failures.forEach { failure ->
            refreshAnswers(failure)
            assertThrows(IOException::class.java) { authenticator.authenticate(null, unauthorized()) }
        }

        verify(exactly = 0) { prefs.triggerLogout() }
    }
}
