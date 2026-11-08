package com.fieldworker.ui.day

import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class DayRouteTest {

    private fun task(
        id: Long,
        assignee: Long? = ME,
        status: TaskStatus = TaskStatus.NEW,
        planned: String? = null,
    ) = Task(
        id = id,
        taskNumber = "N-$id",
        title = "Заявка $id",
        address = "Адрес $id",
        description = "",
        lat = 59.9,
        lon = 30.3,
        status = status,
        priority = Priority.CURRENT,
        createdAt = "2026-11-01T10:00:00",
        updatedAt = "2026-11-01T10:00:00",
        plannedDate = planned,
        assignedUserId = assignee,
    )

    @Test
    fun `only my open tasks planned up to the day, in saved order`() {
        val tasks = listOf(
            task(1, planned = "2026-11-08T10:00:00"),
            task(2, planned = "2026-11-09T10:00:00"), // завтра
            task(3, assignee = 99), // чужая
            task(4, status = TaskStatus.DONE),
            task(5), // без даты — тоже сегодня
            task(6, planned = "2026-11-07T09:00:00"), // просрочена
        )

        val route = dayRouteTasks(tasks, order = listOf(5, 1), day = "2026-11-08", userId = ME)

        // Сначала сохранённый порядок, остальные — по плановой дате
        assertEquals(listOf(5L, 1L, 6L), route.map { it.id })
    }

    private companion object {
        const val ME = 7L
    }
}
