package com.fieldworker.data.network

import org.junit.Assert.assertEquals
import org.junit.Test

class LogRedactionTest {

    @Test
    fun `websocket token in url is masked`() {
        assertEquals(
            "--> GET wss://example.ru/ws?token=*** http/1.1",
            redactSecrets("--> GET wss://example.ru/ws?token=eyJhbGciOi.abc.def http/1.1"),
        )
    }

    @Test
    fun `only secret params are masked`() {
        assertEquals(
            "/api/x?page=2&access_token=***&size=10",
            redactSecrets("/api/x?page=2&access_token=secret&size=10"),
        )
        assertEquals("/api/tasks?page=1", redactSecrets("/api/tasks?page=1"))
    }
}
