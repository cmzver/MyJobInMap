package com.fieldworker.data.local.entity

import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit тесты для TaskEntity.
 * Проверяют преобразование между Entity и Domain моделями.
 */
class TaskEntityTest {

    @Test
    fun `toDomain converts entity to domain model correctly`() {
        // Given
        val entity = TaskEntity(
            id = 1L,
            taskNumber = "Z-001",
            title = "Test Task",
            address = "Test Address",
            description = "Test Description",
            lat = 55.75,
            lon = 37.62,
            status = "IN_PROGRESS",
            priority = 3, // URGENT
            createdAt = "2024-01-01T10:00:00",
            updatedAt = "2024-01-01T11:00:00",
            commentsCount = 5,
            lastSyncedAt = 1704110400000L,
            isLocallyModified = false,
            pendingStatus = null,
            pendingComment = null
        )

        // When
        val domain = entity.toDomain()

        // Then
        assertEquals(1L, domain.id)
        assertEquals("Z-001", domain.taskNumber)
        assertEquals("Test Task", domain.title)
        assertEquals("Test Address", domain.address)
        assertEquals("Test Description", domain.description)
        assertEquals(55.75, domain.lat!!, 0.001)
        assertEquals(37.62, domain.lon!!, 0.001)
        assertEquals(TaskStatus.IN_PROGRESS, domain.status)
        assertEquals(Priority.URGENT, domain.priority)
        assertEquals("2024-01-01T10:00:00", domain.createdAt)
        assertEquals("2024-01-01T11:00:00", domain.updatedAt)
        assertEquals(5, domain.commentsCount)
    }

    @Test
    fun `fromDomain converts domain model to entity correctly`() {
        // Given
        val domain = Task(
            id = 2L,
            taskNumber = "Z-002",
            title = "Domain Task",
            address = "Domain Address",
            description = "Domain Description",
            lat = 59.93,
            lon = 30.31,
            status = TaskStatus.DONE,
            priority = Priority.PLANNED,
            createdAt = "2024-02-01T12:00:00",
            updatedAt = "2024-02-01T13:00:00",
            commentsCount = 3
        )

        // When
        val entity = TaskEntity.fromDomain(domain)

        // Then
        assertEquals(2L, entity.id)
        assertEquals("Z-002", entity.taskNumber)
        assertEquals("Domain Task", entity.title)
        assertEquals("Domain Address", entity.address)
        assertEquals("Domain Description", entity.description)
        assertEquals(59.93, entity.lat!!, 0.001)
        assertEquals(30.31, entity.lon!!, 0.001)
        assertEquals("DONE", entity.status)
        assertEquals(1, entity.priority) // PLANNED = 1
        assertEquals("2024-02-01T12:00:00", entity.createdAt)
        assertEquals("2024-02-01T13:00:00", entity.updatedAt)
        assertEquals(3, entity.commentsCount)
    }

    @Test
    fun `null coordinates are preserved`() {
        // Given
        val entity = TaskEntity(
            id = 1L,
            taskNumber = "Z-001",
            title = "Task without coords",
            address = "Unknown",
            description = "",
            lat = null,
            lon = null,
            status = "NEW",
            priority = 2,
            createdAt = "",
            updatedAt = "",
            commentsCount = 0
        )

        // When
        val domain = entity.toDomain()

        // Then
        assertNull(domain.lat)
        assertNull(domain.lon)
        assertFalse(domain.hasValidCoordinates())
    }

    @Test
    fun `zero coordinates are not valid`() {
        // Given
        val domain = Task(
            id = 1L,
            taskNumber = "Z-001",
            title = "Task",
            address = "Address",
            description = "",
            lat = 0.0,
            lon = 0.0,
            status = TaskStatus.NEW,
            priority = Priority.CURRENT,
            createdAt = "",
            updatedAt = "",
            commentsCount = 0
        )

        // Then
        assertFalse(domain.hasValidCoordinates())
    }

    @Test
    fun `valid coordinates are recognized`() {
        // Given
        val domain = Task(
            id = 1L,
            taskNumber = "Z-001",
            title = "Task",
            address = "Address",
            description = "",
            lat = 55.75,
            lon = 37.62,
            status = TaskStatus.NEW,
            priority = Priority.CURRENT,
            createdAt = "",
            updatedAt = "",
            commentsCount = 0
        )

        // Then
        assertTrue(domain.hasValidCoordinates())
    }

    @Test
    fun `status conversion handles all enum values`() {
        // Test all status values
        val statuses = listOf("NEW", "IN_PROGRESS", "DONE", "CANCELLED", "UNKNOWN_STATUS")
        val expected = listOf(
            TaskStatus.NEW,
            TaskStatus.IN_PROGRESS,
            TaskStatus.DONE,
            TaskStatus.CANCELLED,
            TaskStatus.UNKNOWN
        )

        statuses.zip(expected).forEach { (statusStr, expectedStatus) ->
            val entity = createTestEntity(status = statusStr)
            assertEquals(expectedStatus, entity.toDomain().status)
        }
    }

    @Test
    fun `priority conversion handles all values`() {
        // Test priority values: 1=Плановая, 2=Текущая, 3=Срочная, 4=Аварийная
        val priorities = listOf(1, 2, 3, 4, 0, 99)
        val expected = listOf(
            Priority.PLANNED,   // 1
            Priority.CURRENT,   // 2
            Priority.URGENT,    // 3
            Priority.EMERGENCY, // 4
            Priority.PLANNED,   // 0 defaults to PLANNED
            Priority.PLANNED    // 99 defaults to PLANNED
        )

        priorities.zip(expected).forEach { (priorityInt, expectedPriority) ->
            val entity = createTestEntity(priority = priorityInt)
            assertEquals(expectedPriority, entity.toDomain().priority)
        }
    }

    private fun createTestEntity(
        status: String = "NEW",
        priority: Int = 2
    ) = TaskEntity(
        id = 1L,
        taskNumber = "Z-001",
        title = "Test",
        address = "Address",
        description = "",
        lat = null,
        lon = null,
        status = status,
        priority = priority,
        createdAt = "",
        updatedAt = "",
        commentsCount = 0
    )
}
