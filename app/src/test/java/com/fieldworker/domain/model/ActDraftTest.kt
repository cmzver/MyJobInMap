package com.fieldworker.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class ActDraftTest {

    @Test
    fun `amounts accept comma, spaces and ignore garbage`() {
        assertEquals(BigDecimal("1500.5"), parseAmount("1 500,5"))
        assertEquals(BigDecimal("1500"), parseAmount("1 500"))
        assertEquals(BigDecimal.ZERO, parseAmount("abc"))
        assertEquals(BigDecimal.ZERO, parseAmount("-5"))
    }

    @Test
    fun `total sums filled lines rounded to kopecks`() {
        val draft = ActDraft(
            lines = listOf(
                ActLineDraft(key = 1, name = "Замена трубки", qty = "2", price = "1500"),
                ActLineDraft(key = 2, name = "Кабель", qty = "3,5", price = "45,33"),
                ActLineDraft(key = 3), // пустая строка не считается
            )
        )

        assertEquals(BigDecimal("3158.66"), draft.total)
        assertEquals(2, draft.filledLines.size)
    }

    @Test
    fun `act needs a line or a description`() {
        assertFalse(ActDraft(lines = listOf(ActLineDraft(key = 1))).canSubmit)
        assertTrue(ActDraft(workSummary = "Проверена связь").canSubmit)
        assertTrue(ActDraft(lines = listOf(ActLineDraft(key = 1, catalogItemId = 5))).canSubmit)
    }
}
