package com.fieldworker.data.mapper

import com.fieldworker.data.remote.generated.ActCreate
import com.fieldworker.data.remote.generated.ActLineInput
import com.fieldworker.domain.model.ActDraft
import com.fieldworker.domain.model.ActPaymentMethod
import com.fieldworker.domain.model.ActSignerRole
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/** Время, место и устройство подписи, отказ — поля ActMobileCreate поверх ActCreate. */
data class ActSigningMeta(
    val signedAt: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val device: String? = null,
    val refusalReason: String? = null,
)

fun ActDraft.toActCreate(): ActCreate = ActCreate(
    lines = filledLines.map { line ->
        ActLineInput(
            catalogItemId = line.catalogItemId,
            lineType = if (line.isMaterial) ActLineInput.LineType.MATERIAL else ActLineInput.LineType.WORK,
            name = line.name.trim().ifEmpty { null },
            unit = line.unit.trim().ifEmpty { null },
            qty = line.qtyValue,
            price = line.priceValue,
            serialNumber = line.serialNumber.trim().ifEmpty { null }.takeIf { line.isMaterial },
            installToObject = line.isMaterial && line.installToObject,
        )
    },
    customerName = customerName.trim().ifEmpty { null },
    customerRole = customerRole.toApi(),
    customerPhone = customerPhone.trim().ifEmpty { null },
    apartment = apartment.trim().ifEmpty { null },
    workSummary = workSummary.trim().ifEmpty { null },
    customerRemarks = remarks.trim().ifEmpty { null }.takeUnless { noClaims },
    noClaims = noClaims,
    // Оплата имеет смысл, только если есть что оплачивать
    paymentMethod = if (total.signum() > 0) paymentMethod.toApi() else ActCreate.PaymentMethod.NONE,
)

/**
 * Тело multipart-поля payload: сгенерированный ActCreate плюс поля подписи
 * (ActMobileCreate на сервере). Поля со значением по умолчанию Json опускает —
 * у сервера те же умолчания.
 */
fun buildActPayload(json: Json, draft: ActDraft, meta: ActSigningMeta): String {
    val base = json.encodeToJsonElement(ActCreate.serializer(), draft.toActCreate()).jsonObject
    val extra = buildMap<String, JsonElement> {
        meta.signedAt?.let { put("signed_at", JsonPrimitive(it)) }
        meta.lat?.let { put("sign_lat", JsonPrimitive(it)) }
        meta.lon?.let { put("sign_lon", JsonPrimitive(it)) }
        meta.device?.let { put("sign_device", JsonPrimitive(it)) }
        meta.refusalReason?.let { put("refusal_reason", JsonPrimitive(it)) }
    }
    return JsonObject(base + extra).toString()
}

private fun ActSignerRole.toApi(): ActCreate.CustomerRole = when (this) {
    ActSignerRole.RESIDENT -> ActCreate.CustomerRole.RESIDENT
    ActSignerRole.CHAIRMAN -> ActCreate.CustomerRole.CHAIRMAN
    ActSignerRole.UK_REP -> ActCreate.CustomerRole.UK_REP
    ActSignerRole.OTHER -> ActCreate.CustomerRole.OTHER
}

private fun ActPaymentMethod.toApi(): ActCreate.PaymentMethod = when (this) {
    ActPaymentMethod.NONE -> ActCreate.PaymentMethod.NONE
    ActPaymentMethod.CASH -> ActCreate.PaymentMethod.CASH
    ActPaymentMethod.CARD -> ActCreate.PaymentMethod.CARD
    ActPaymentMethod.TRANSFER -> ActCreate.PaymentMethod.TRANSFER
    ActPaymentMethod.CONTRACT -> ActCreate.PaymentMethod.CONTRACT
}
