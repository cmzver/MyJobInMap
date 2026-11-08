package com.fieldworker.data.preferences

import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.testutil.FakeSharedPreferences
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Test

class StatusFilterPreferenceTest {

    private val storage = FakeSharedPreferences()

    /** Новый экземпляр поверх того же хранилища — как после перезапуска. */
    private fun reopen(): AppPreferences {
        val context = mockk<android.content.Context>(relaxed = true)
        every { context.getSharedPreferences(any(), any()) } returns storage
        return AppPreferences(context)
    }

    @Test
    fun `by default all statuses are shown`() {
        assertEquals(emptySet<TaskStatus>(), reopen().getStatusFilter())
    }

    @Test
    fun `choosing All survives a restart`() {
        val prefs = reopen()
        prefs.setStatusFilter(setOf(TaskStatus.NEW))
        assertEquals(setOf(TaskStatus.NEW), reopen().getStatusFilter())

        prefs.setStatusFilter(emptySet())
        assertEquals(emptySet<TaskStatus>(), reopen().getStatusFilter())
        assertEquals(emptySet<TaskStatus>(), reopen().statusFilter.value)
    }
}
