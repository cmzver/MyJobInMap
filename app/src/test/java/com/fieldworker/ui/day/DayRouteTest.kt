package com.fieldworker.ui.day

import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.theme.AppColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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

    @Test
    fun `stop color matches the map route point`() {
        assertEquals(AppColors.StatusNew, dayStopColor(task(1)))
        assertEquals(AppColors.StatusInProgress, dayStopColor(task(1, status = TaskStatus.IN_PROGRESS)))
        // Аварийная — единственный красный
        assertEquals(AppColors.PriorityEmergency, dayStopColor(task(1).copy(priority = Priority.EMERGENCY)))
    }

    @Test
    fun `offline order is merged over the server day`() {
        // 3 сняли с дня, 4 добавили — своя перестановка 2 выше 1 сохраняется
        assertEquals(listOf(2L, 1L, 4L), mergeDayOrder(local = listOf(2, 3, 1), server = listOf(1, 2, 4)))
        assertEquals(listOf(1L, 2L), mergeDayOrder(local = emptyList(), server = listOf(1, 2)))
    }

    @Test
    fun `plan label shows time today and overdue before`() {
        val day = "2026-11-08"
        assertEquals(DayStopPlan("план на 10:30", overdue = false), dayStopPlan("2026-11-08T10:30:00", day))
        assertEquals(DayStopPlan("просрочено, план 07.11", overdue = true), dayStopPlan("2026-11-07T09:00:00", day))
        assertEquals(DayStopPlan("просрочено, план 05.11", overdue = true), dayStopPlan("2026-11-05", day))
        // Сегодня без времени — подпись не нужна
        assertNull(dayStopPlan("2026-11-08", day))
        assertNull(dayStopPlan("2026-11-08T00:00:00", day))
        assertNull(dayStopPlan(null, day))
        assertNull(dayStopPlan("мусор", day))
    }

    @Test
    fun `subtitle names the day in russian and counts stops`() {
        assertEquals("воскресенье, 8 ноября · 3 выезда", myDaySubtitle("2026-11-08", 3))
        assertEquals("воскресенье, 8 ноября · 1 выезд", myDaySubtitle("2026-11-08", 1))
        assertEquals("воскресенье, 8 ноября · 5 выездов", myDaySubtitle("2026-11-08", 5))
        assertEquals("воскресенье, 8 ноября", myDaySubtitle("2026-11-08", 0))
        assertEquals("воскресенье, 8 ноября", myDaySubtitle("2026-11-08", null))
    }

    private companion object {
        const val ME = 7L
    }
}
