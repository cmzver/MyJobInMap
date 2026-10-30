package com.fieldworker.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Отложенное действие для синхронизации при появлении сети.
 * Хранит изменения, сделанные в offline-режиме.
 */
@Entity(tableName = "pending_actions")
data class PendingAction(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val taskId: Long,
    val actionType: ActionType,
    val newStatus: String? = null,
    val plannedDate: String? = null,
    val comment: String? = null,
    val tempId: String? = null,
    /** Снимок в личных файлах приложения — для [ActionType.UPLOAD_PHOTO]. */
    val filePath: String? = null,
    val photoType: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0,
    val lastError: String? = null,
    /**
     * Стабильный ID операции — уходит заголовком Idempotency-Key, чтобы повтор
     * после потерянного HTTP-ответа не выполнил операцию на сервере дважды.
     */
    @ColumnInfo(defaultValue = "")
    val operationId: String = UUID.randomUUID().toString()
)

/**
 * Типы отложенных действий.
 *
 * @property mutatesTask действие уже применено к заявке в кеше: пока оно не
 *   отправлено, заявку нельзя перезаписывать серверной версией.
 * @property keepsTaskOrder действие уходит строго после предыдущих по той же
 *   заявке, а его сбой задерживает следующие. Фото ни от чего не зависит.
 */
enum class ActionType(val mutatesTask: Boolean, val keepsTaskOrder: Boolean) {
    UPDATE_STATUS(mutatesTask = true, keepsTaskOrder = true),
    ADD_COMMENT(mutatesTask = false, keepsTaskOrder = true),
    UPDATE_PLANNED_DATE(mutatesTask = true, keepsTaskOrder = true),
    UPLOAD_PHOTO(mutatesTask = false, keepsTaskOrder = false)
}
