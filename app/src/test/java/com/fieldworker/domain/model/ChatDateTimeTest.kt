package com.fieldworker.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

class ChatDateTimeTest {

    @Test
    fun `server utc time is converted to device time`() {
        val local = LocalDateTime.of(2026, 11, 7, 12, 0, 30)
        val utc = local.atZone(ZoneId.systemDefault())
            .withZoneSameInstant(ZoneOffset.UTC)
            .toLocalDateTime()

        assertEquals(local, parseDateTime("${utc}.123456Z"))
    }

    @Test
    fun `explicit offset is honoured`() {
        val expected = LocalDateTime.of(2026, 11, 7, 9, 0)
            .atOffset(ZoneOffset.UTC)
            .atZoneSameInstant(ZoneId.systemDefault())
            .toLocalDateTime()

        assertEquals(expected, parseDateTime("2026-11-07T12:00:00+03:00"))
    }

    @Test
    fun `value without zone is local and garbage is null`() {
        assertEquals(LocalDateTime.of(2026, 11, 7, 12, 0), parseDateTime("2026-11-07T12:00:00.5"))
        assertNull(parseDateTime(""))
        assertNull(parseDateTime("вчера"))
    }
}
