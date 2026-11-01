package com.fieldworker.domain.model

/**
 * Офлайн-действие, которое очередь больше не повторяет сама (dead-letter):
 * исчерпаны попытки или сервер отклонил его окончательно (4xx). Пользователь
 * решает — повторить или отменить локальное изменение.
 */
data class FailedAction(
    val id: Long,
    val taskId: Long,
    val taskLabel: String,
    val description: String,
    val reason: String,
    val isFailed: Boolean = true,
    val isConflict: Boolean = false,
    val serverState: String? = null,
    val editKind: OfflineChangeKind? = null,
    val editValue: String = "",
    val editComment: String = "",
)

enum class OfflineChangeKind { STATUS, PLANNED_DATE, COMMENT }
