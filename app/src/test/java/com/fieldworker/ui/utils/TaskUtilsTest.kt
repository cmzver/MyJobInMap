package com.fieldworker.ui.utils

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class TaskUtilsTest {

    private val today = LocalDate.of(2026, 10, 28)

    @Test
    fun `compact date shows time for today, day-month for this year, short year otherwise`() {
        assertEquals("14:30", TaskUtils.formatCompactDate("2026-10-28T14:30:00", today))
        assertEquals("27.10", TaskUtils.formatCompactDate("2026-10-27T09:00:00", today))
        assertEquals("31.12.25", TaskUtils.formatCompactDate("2025-12-31T23:00:00", today))
    }

    @Test
    fun `phone is formatted for display and left as is when non-standard`() {
        assertEquals("+7 921 987-65-43", formatPhoneForDisplay("89219876543"))
        assertEquals("+7 921 987-65-43", formatPhoneForDisplay("+7 (921) 987-65-43"))
        assertEquals("+1234", formatPhoneForDisplay("1234"))
    }
}
