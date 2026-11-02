package com.fieldworker.domain.model

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Черновик акта на телефоне мастера. Числа — строками, как их ввели: итог
 * показываем сразу, а окончательные суммы всё равно считает сервер.
 */
data class ActDraft(
    val lines: List<ActLineDraft> = emptyList(),
    val customerName: String = "",
    val customerRole: ActSignerRole = ActSignerRole.RESIDENT,
    val customerPhone: String = "",
    val apartment: String = "",
    val workSummary: String = "",
    val noClaims: Boolean = true,
    val remarks: String = "",
    val paymentMethod: ActPaymentMethod = ActPaymentMethod.NONE,
) {
    val filledLines: List<ActLineDraft>
        get() = lines.filterNot { it.isBlank }

    val total: BigDecimal
        get() = filledLines.fold(BigDecimal.ZERO.setScale(2)) { sum, line -> sum + line.amount }

    /** Пустой акт сервер не примет: нужна строка или описание работ. */
    val canSubmit: Boolean
        get() = filledLines.isNotEmpty() || workSummary.isNotBlank()
}

data class ActLineDraft(
    val key: Long,
    val catalogItemId: Long? = null,
    val isMaterial: Boolean = false,
    val name: String = "",
    val unit: String = "усл",
    val qty: String = "1",
    val price: String = "0",
    /** Материал: серийный номер и «установлено на объект» — заведётся в оборудование адреса. */
    val serialNumber: String = "",
    val installToObject: Boolean = false,
) {
    val qtyValue: BigDecimal
        get() = parseAmount(qty)

    val priceValue: BigDecimal
        get() = parseAmount(price)

    val amount: BigDecimal
        get() = (qtyValue * priceValue).setScale(2, RoundingMode.HALF_UP)

    val isBlank: Boolean
        get() = name.isBlank() && catalogItemId == null
}

enum class ActSignerRole(val apiValue: String, val label: String) {
    RESIDENT("resident", "Жилец"),
    CHAIRMAN("chairman", "Председатель"),
    UK_REP("uk_rep", "Представитель УК"),
    OTHER("other", "Другое"),
}

enum class ActPaymentMethod(val apiValue: String, val label: String) {
    NONE("none", "Без оплаты"),
    CASH("cash", "Наличные"),
    CARD("card", "Карта"),
    TRANSFER("transfer", "Перевод"),
    CONTRACT("contract", "По договору"),
}

/** «1 500,50» и «1500.5» — одно число; мусор и минус — ноль. */
fun parseAmount(text: String): BigDecimal =
    text.filterNot { it.isWhitespace() || it == ' ' }
        .replace(',', '.')
        .toBigDecimalOrNull()
        ?.takeIf { it.signum() >= 0 }
        ?: BigDecimal.ZERO

/** Акт в очереди отправки — для блока «Акты» без сети. */
data class PendingAct(
    val id: Long,
    val total: BigDecimal,
    val kind: PendingActKind,
    val isFailed: Boolean,
)

enum class PendingActKind(val label: String) {
    SIGNED("подписан клиентом"),
    REFUSED("отказ от подписи"),
    AWAITING("подпишет позже"),
}
