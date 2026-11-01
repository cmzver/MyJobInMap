package com.fieldworker.domain.model

/**
 * Более ранняя заявка на том же месте (адрес + система), повтором которой стала эта.
 * Приходит с сервера вместе с заявкой и хранится в кеше — мастер видит офлайн,
 * кто и с каким комментарием закрывал прошлую.
 */
data class TaskRepeat(
    val taskId: Long,
    val taskNumber: String,
    /** true — прошлую недавно закрыли (возврат); false — она ещё открыта (дубль). */
    val isReturn: Boolean,
    val sameDefect: Boolean = false,
    /** Возврат — когда закрыли прошлую; дубль — когда её создали. */
    val date: String? = null,
    val assigneeName: String? = null,
    val completionComment: String? = null
)
