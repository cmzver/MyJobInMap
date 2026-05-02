package com.fieldworker.ui.map

import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MapMarkerGroupingTest {

    private fun sampleTask(
        id: Long,
        address: String,
        lat: Double = 55.75,
        lon: Double = 37.62,
    ) = Task(
        id = id,
        taskNumber = "Z-$id",
        title = "Task $id",
        address = address,
        description = "Description $id",
        lat = lat,
        lon = lon,
        status = TaskStatus.NEW,
        priority = Priority.CURRENT,
        createdAt = "2026-02-15T10:00:00",
        updatedAt = "2026-02-15T10:00:00",
    )

    @Test
    fun `buildTaskMarkerGroups merges tasks with same address`() {
        val groups = buildTaskMarkerGroups(
            listOf(
                sampleTask(1, "ул. Ленина 10", lat = 55.75, lon = 37.62),
                sampleTask(2, "  УЛ.  ЛЕНИНА 10 ", lat = 55.751, lon = 37.621),
            )
        )

        assertEquals(1, groups.size)
        assertEquals(2, groups.first().count)
        assertTrue(groups.first().isCluster)
        assertEquals(listOf(1L, 2L), groups.first().tasks.map(Task::id))
    }

    @Test
    fun `buildTaskMarkerGroups keeps different addresses at distinct coords separate`() {
        val groups = buildTaskMarkerGroups(
            listOf(
                sampleTask(1, "ул. Ленина 10", lat = 55.75, lon = 37.62),
                sampleTask(2, "ул. Пушкина 5", lat = 55.80, lon = 37.50),
            )
        )

        assertEquals(2, groups.size)
        assertTrue(groups.all { !it.isCluster })
    }

    @Test
    fun `buildTaskMarkerGroups merges different addresses sharing the same physical location`() {
        val groups = buildTaskMarkerGroups(
            listOf(
                sampleTask(1, "ул. Ленина 10", lat = 55.75, lon = 37.62),
                sampleTask(2, "ул. Ленина 10, кв. 5", lat = 55.75, lon = 37.62),
                sampleTask(3, "ул. Ленина 10, кв. 12", lat = 55.75001, lon = 37.62002),
            )
        )

        assertEquals(1, groups.size)
        assertEquals(3, groups.first().count)
        assertTrue(groups.first().isCluster)
    }

    @Test
    fun `buildTaskMarkerGroups falls back to coordinates when address is blank`() {
        val groups = buildTaskMarkerGroups(
            listOf(
                sampleTask(1, "", lat = 55.750001, lon = 37.620001),
                sampleTask(2, " ", lat = 55.750002, lon = 37.620002),
            )
        )

        assertEquals(1, groups.size)
        assertEquals(2, groups.first().count)
    }

    @Test
    fun `buildTaskMarkerGroups ignores tasks without coordinates`() {
        val groups = buildTaskMarkerGroups(
            listOf(
                sampleTask(1, "ул. Ленина 10"),
                sampleTask(2, "ул. Ленина 10", lat = 0.0, lon = 0.0),
            )
        )

        assertEquals(1, groups.size)
        assertEquals(1, groups.first().count)
        assertFalse(groups.first().isCluster)
    }
    @Test
    fun `group sorts tasks by priority then status`() {
        val group = buildTaskMarkerGroups(
            listOf(
                sampleTask(1, "СѓР». Р›РµРЅРёРЅР° 10").copy(
                    priority = Priority.CURRENT,
                    status = TaskStatus.IN_PROGRESS,
                ),
                sampleTask(2, "СѓР». Р›РµРЅРёРЅР° 10").copy(
                    priority = Priority.EMERGENCY,
                    status = TaskStatus.DONE,
                ),
                sampleTask(3, "СѓР». Р›РµРЅРёРЅР° 10").copy(
                    priority = Priority.EMERGENCY,
                    status = TaskStatus.NEW,
                ),
            )
        ).first()

        assertEquals(listOf(3L, 2L, 1L), group.sortedTasks.map(Task::id))
    }

    @Test
    fun `group summary aggregates counts and highest priority`() {
        val summary = buildTaskMarkerGroups(
            listOf(
                sampleTask(1, "СѓР». Р›РµРЅРёРЅР° 10").copy(
                    priority = Priority.CURRENT,
                    status = TaskStatus.NEW,
                ),
                sampleTask(2, "СѓР». Р›РµРЅРёРЅР° 10").copy(
                    priority = Priority.EMERGENCY,
                    status = TaskStatus.IN_PROGRESS,
                ),
                sampleTask(3, "СѓР». Р›РµРЅРёРЅР° 10").copy(status = TaskStatus.DONE),
                sampleTask(4, "СѓР». Р›РµРЅРёРЅР° 10").copy(status = TaskStatus.CANCELLED),
            )
        ).first().summary

        assertEquals(Priority.EMERGENCY, summary.highestPriority)
        assertEquals(1, summary.newCount)
        assertEquals(1, summary.inProgressCount)
        assertEquals(1, summary.doneCount)
        assertEquals(1, summary.cancelledCount)
        assertEquals(2, summary.activeCount)
    }
}
