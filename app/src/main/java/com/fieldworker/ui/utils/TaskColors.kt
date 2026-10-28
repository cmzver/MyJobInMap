package com.fieldworker.ui.utils

import androidx.compose.ui.graphics.Color
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.theme.AppColors

/**
 * Палитра заявок. Цвет несёт статус; приоритет — иконка и слово, и только
 * аварийный приоритет получает красный (больше красного на экране нет), чтобы
 * «Новая» и «Аварийная» не сливались.
 */
fun statusColor(status: TaskStatus): Color = when (status) {
    TaskStatus.NEW -> AppColors.StatusNew
    TaskStatus.IN_PROGRESS -> AppColors.StatusInProgress
    TaskStatus.DONE -> AppColors.StatusDone
    TaskStatus.CANCELLED, TaskStatus.UNKNOWN -> AppColors.StatusCancelled
}

/** Подложка чипа статуса: полупрозрачная, поэтому работает в обеих темах. */
fun statusBackground(status: TaskStatus): Color = statusColor(status).copy(alpha = 0.14f)

fun priorityColor(priority: Priority): Color = when (priority) {
    Priority.EMERGENCY -> AppColors.PriorityEmergency
    else -> AppColors.PriorityNeutral
}

fun priorityBackground(priority: Priority): Color = priorityColor(priority).copy(alpha = 0.12f)

/** Приоритет, ради которого стоит «жечь» цвет: только аварийная. */
fun Priority.isAttention(): Boolean = this == Priority.EMERGENCY
