package com.fieldworker.next.data.remote.mapper

import com.fieldworker.next.data.remote.PortalPayloadException
import com.fieldworker.next.data.remote.model.PortalCommentDto
import com.fieldworker.next.data.remote.model.PortalTaskDetailDto
import com.fieldworker.next.data.remote.model.PortalTaskListItemDto
import com.fieldworker.next.domain.model.TaskPriority
import com.fieldworker.next.domain.model.TaskStatus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PortalTaskMappersTest {
    @Test
    fun `task summary maps backend fields into domain card`() {
        val summary = PortalTaskListItemDto(
            id = 101,
            taskNumber = "FW-101",
            title = "Replace panel power supply",
            rawAddress = "Lenina 14",
            status = "IN_PROGRESS",
            priority = "EMERGENCY",
            plannedDate = "2026-04-14T09:00:00",
        ).toTaskSummary(nowIso = "2026-04-14T11:30:00")

        assertEquals(TaskStatus.IN_PROGRESS, summary.status)
        assertEquals(TaskPriority.EMERGENCY, summary.priority)
        assertEquals("2026-04-14 09:00", summary.plannedLabel)
        assertTrue(summary.isOverdue)
    }

    @Test
    fun `task detail builds system comment from status transition`() {
        val detail = PortalTaskDetailDto(
            id = 102,
            taskNumber = "FW-102",
            title = "Restore intercom line",
            rawAddress = "Mira 8",
            description = "Need confirmation from dispatcher after repair.",
            status = "IN_PROGRESS",
            priority = "URGENT",
            plannedDate = "2026-04-14T16:00:00",
            comments = listOf(
                PortalCommentDto(
                    id = 7,
                    taskId = 102,
                    text = "",
                    author = "System",
                    oldStatus = "NEW",
                    newStatus = "IN_PROGRESS",
                    createdAt = "2026-04-14T10:15:00",
                )
            ),
        ).toTaskDetail(nowIso = "2026-04-14T12:00:00")

        assertEquals(TaskStatus.IN_PROGRESS, detail.status)
        assertEquals(listOf(TaskStatus.DONE, TaskStatus.CANCELLED), detail.availableTransitions)
        assertEquals("Status: New -> In Progress", detail.comments.first().message)
        assertEquals("2026-04-14 10:15", detail.comments.first().createdAtLabel)
        assertTrue(detail.comments.first().isSystemEvent)
        assertFalse(detail.isOverdue)
    }

    @Test
    fun `unsupported status fails fast during mapping`() {
        val dto = PortalTaskListItemDto(
            id = 103,
            taskNumber = "FW-103",
            title = "Unknown state task",
            rawAddress = "Kirova 3",
            status = "PAUSED",
            priority = "CURRENT",
        )

        assertFailsWith<PortalPayloadException> {
            dto.toTaskSummary()
        }
    }
}
