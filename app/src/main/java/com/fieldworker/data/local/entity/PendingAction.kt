package com.fieldworker.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

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
    val comment: String? = null,
    val tempId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0,
    val lastError: String? = null
)

/**
 * Типы отложенных действий
 */
enum class ActionType {
    UPDATE_STATUS,
    ADD_COMMENT
}
