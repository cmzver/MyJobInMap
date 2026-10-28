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
)
