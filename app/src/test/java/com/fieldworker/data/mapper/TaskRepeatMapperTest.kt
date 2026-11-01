package com.fieldworker.data.mapper

import com.fieldworker.data.remote.generated.TaskRepeatRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskRepeatMapperTest {

    private fun ref(kind: TaskRepeatRef.Kind) = TaskRepeatRef(
        id = 1L,
        taskNumber = "Z-00001",
        kind = kind,
        status = "DONE",
        sameDefect = null,
        createdAt = "2026-10-01T09:00:00Z",
        completedAt = "2026-10-03T15:00:00Z",
        assignedUserName = "Иванов И.",
        completionComment = "Заменил блок питания"
    )

    @Test
    fun `return dates by completion of the previous task`() {
        val repeat = ref(TaskRepeatRef.Kind.RETURN).toDomain()

        assertTrue(repeat.isReturn)
        assertEquals("2026-10-03T15:00:00Z", repeat.date)
        assertFalse(repeat.sameDefect)
        assertEquals("Заменил блок питания", repeat.completionComment)
    }

    @Test
    fun `duplicate dates by creation of the open task`() {
        val repeat = ref(TaskRepeatRef.Kind.DUPLICATE).toDomain()

        assertFalse(repeat.isReturn)
        assertEquals("2026-10-01T09:00:00Z", repeat.date)
    }
}
