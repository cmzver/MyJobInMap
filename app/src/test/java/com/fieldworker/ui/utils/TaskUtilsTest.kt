package com.fieldworker.ui.utils

import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

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

    /** Момент «как с сервера» для местного времени устройства — тесты не зависят от пояса. */
    private fun serverMoment(local: LocalDateTime): String =
        local.atZone(ZoneId.systemDefault()).toOffsetDateTime().toString()

    @Test
    fun `due is shown relative to today in device time`() {
        val now = LocalDateTime.of(2026, 11, 1, 10, 0)

        assertEquals("сегодня 18:00", TaskUtils.formatDue(serverMoment(now.withHour(18)), now))
        assertEquals("завтра 09:30", TaskUtils.formatDue(serverMoment(now.plusDays(1).withHour(9).withMinute(30)), now))
        assertEquals("05.11 12:00", TaskUtils.formatDue(serverMoment(now.plusDays(4).withHour(12)), now))
    }

    @Test
    fun `due in the past is overdue`() {
        val now = LocalDateTime.of(2026, 11, 1, 10, 0)

        assertTrue(TaskUtils.isMomentPast(serverMoment(now.minusMinutes(1)), now))
        assertFalse(TaskUtils.isMomentPast(serverMoment(now.plusMinutes(1)), now))
        assertFalse(TaskUtils.isMomentPast(null, now))
    }

    @Test
    fun `sort by due puts burning first and tasks without due last`() {
        fun task(id: Long, dueAt: String?) = Task(
            id = id, taskNumber = "Z-$id", title = "", address = "", description = "",
            lat = null, lon = null, status = TaskStatus.NEW, priority = Priority.CURRENT,
            createdAt = "2026-11-01T00:00:00Z", updatedAt = "2026-11-01T00:00:00Z", dueAt = dueAt,
        )
        val now = LocalDateTime.of(2026, 11, 1, 10, 0)
        val tasks = listOf(
            task(1, null),
            task(2, serverMoment(now.plusDays(1))),
            task(3, serverMoment(now.minusHours(2))),
        )

        assertEquals(listOf(3L, 2L, 1L), tasks.sortedBy(TaskSortOrder.BY_DUE).map { it.id })
    }
}
