package com.fieldworker.ui.utils

import androidx.compose.ui.graphics.Color
import com.fieldworker.domain.model.Priority

/**
 * Цвет приоритета. Акцент отдаём только тому, что требует внимания
 * (аварийная/срочная); текущие и плановые — нейтральный серый, чтобы экран
 * рутинных заявок был спокойным, а срочное выстреливало. См. [Priority.isAttention].
 */
fun priorityColor(priority: Priority): Color = when (priority) {
    Priority.EMERGENCY -> Color(0xFFFF3B30)
    Priority.URGENT    -> Color(0xFFFF9500)
    Priority.CURRENT   -> NEUTRAL_PRIORITY
    Priority.PLANNED   -> NEUTRAL_PRIORITY
}

fun priorityBackground(priority: Priority): Color = when (priority) {
    Priority.EMERGENCY -> Color(0xFFFFEBEE)
    Priority.URGENT    -> Color(0xFFFFF3E0)
    Priority.CURRENT   -> NEUTRAL_PRIORITY_BG
    Priority.PLANNED   -> NEUTRAL_PRIORITY_BG
}

/** Приоритет, ради которого стоит «жечь» цвет: аварийная или срочная. */
fun Priority.isAttention(): Boolean =
    this == Priority.EMERGENCY || this == Priority.URGENT

private val NEUTRAL_PRIORITY = Color(0xFF8E8E93)
private val NEUTRAL_PRIORITY_BG = Color(0xFFEFEFF0)
