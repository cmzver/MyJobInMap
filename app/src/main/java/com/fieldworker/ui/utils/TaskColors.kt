package com.fieldworker.ui.utils

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
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

/** Тёмная ли текущая тема (у ColorScheme нет флага — судим по фону). */
@Composable
@ReadOnlyComposable
fun isDarkPalette(): Boolean = MaterialTheme.colorScheme.background.luminance() < 0.5f

/**
 * Цвет статуса для UI с учётом темы. Не-Compose код (маркеры карты) берёт
 * базовый [statusColor].
 */
@Composable
@ReadOnlyComposable
fun TaskStatus.contentColor(): Color = if (!isDarkPalette()) {
    when (this) {
        TaskStatus.NEW -> AppColors.StatusNewText
        TaskStatus.IN_PROGRESS -> AppColors.StatusInProgressText
        TaskStatus.DONE -> AppColors.StatusDoneText
        TaskStatus.CANCELLED, TaskStatus.UNKNOWN -> AppColors.StatusCancelledText
    }
} else {
    when (this) {
        TaskStatus.NEW -> AppColors.StatusNewDark
        TaskStatus.IN_PROGRESS -> AppColors.StatusInProgressDark
        TaskStatus.DONE -> AppColors.StatusDoneDark
        TaskStatus.CANCELLED, TaskStatus.UNKNOWN -> AppColors.StatusCancelledDark
    }
}

/** Подложка чипа статуса: светлый тон базового цвета (текст на ней — ≥4.4:1). */
@Composable
@ReadOnlyComposable
fun TaskStatus.containerColor(): Color = if (isDarkPalette()) {
    contentColor().copy(alpha = 0.18f)
} else {
    statusColor(this).copy(alpha = 0.10f)
}

/** Зелёный для текста «успешно» (сервер доступен и т.п.) с учётом темы. */
@Composable
@ReadOnlyComposable
fun successTextColor(): Color = if (isDarkPalette()) AppColors.StatusDoneDark else AppColors.StatusDoneText

/** Оранжевый для текста-ссылки (телефон, «Установить», «Назначить»…) с учётом темы. */
@Composable
@ReadOnlyComposable
fun accentTextColor(): Color = if (isDarkPalette()) MaterialTheme.colorScheme.primary else AppColors.AccentText

@Composable
@ReadOnlyComposable
fun Priority.contentColor(): Color = when {
    this != Priority.EMERGENCY -> AppColors.PriorityNeutral
    isDarkPalette() -> AppColors.PriorityEmergencyDark
    else -> AppColors.PriorityEmergency
}
