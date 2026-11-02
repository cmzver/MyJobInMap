package com.fieldworker.data.mapper

import com.fieldworker.data.remote.generated.ActCreate
import com.fieldworker.di.NetworkModule
import com.fieldworker.domain.model.ActDraft
import com.fieldworker.domain.model.ActLineDraft
import com.fieldworker.domain.model.ActPaymentMethod
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class ActMappersTest {

    private val json = NetworkModule.provideJson()

    @Test
    fun `payment and remarks only when they make sense`() {
        val free = ActDraft(
            workSummary = "Проверка",
            paymentMethod = ActPaymentMethod.CASH,
            remarks = "не нужно",
        ).toActCreate()

        assertEquals(ActCreate.PaymentMethod.NONE, free.paymentMethod)
        assertNull(free.customerRemarks)

        val paid = ActDraft(
            lines = listOf(ActLineDraft(key = 1, name = "Трубка", price = "1290")),
            paymentMethod = ActPaymentMethod.CASH,
            noClaims = false,
            remarks = "Царапина на корпусе",
        ).toActCreate()

        assertEquals(ActCreate.PaymentMethod.CASH, paid.paymentMethod)
        assertEquals("Царапина на корпусе", paid.customerRemarks)
    }

    @Test
    fun `payload carries lines and signing fields for the server`() {
        val draft = ActDraft(
            lines = listOf(ActLineDraft(key = 1, catalogItemId = 7, name = "Замена трубки", qty = "2", price = "1500")),
            customerName = "Петров П. П.",
        )

        val payload = json.parseToJsonElement(
            buildActPayload(json, draft, ActSigningMeta(signedAt = "2026-11-01T11:05:00Z", refusalReason = null))
        ).jsonObject

        val line = payload.getValue("lines").jsonArray.single().jsonObject
        assertEquals("7", line.getValue("catalog_item_id").jsonPrimitive.content)
        assertEquals("2", line.getValue("qty").jsonPrimitive.content)
        assertEquals("1500", line.getValue("price").jsonPrimitive.content)
        assertEquals("Петров П. П.", payload.getValue("customer_name").jsonPrimitive.content)
        assertEquals("2026-11-01T11:05:00Z", payload.getValue("signed_at").jsonPrimitive.content)
        assertFalse(payload.containsKey("refusal_reason"))
    }

    @Test
    fun `serial and install flag go only with material lines`() {
        val payload = ActDraft(
            lines = listOf(
                ActLineDraft(key = 1, name = "Трубка", isMaterial = true, price = "1290", serialNumber = " SN-1 ", installToObject = true),
                ActLineDraft(key = 2, name = "Работа", price = "500", serialNumber = "X", installToObject = true),
            ),
        ).toActCreate()

        val (material, work) = payload.lines!!
        assertEquals("SN-1", material.serialNumber)
        assertEquals(true, material.installToObject)
        assertNull(work.serialNumber)
        assertEquals(false, work.installToObject)
    }
}
