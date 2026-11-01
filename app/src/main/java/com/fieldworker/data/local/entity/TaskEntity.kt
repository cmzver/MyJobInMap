package com.fieldworker.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskRepeat
import com.fieldworker.domain.model.TaskStatus

/**
 * Room Entity для хранения задач в локальной БД.
 * Используется для offline-режима.
 */
@Entity(tableName = "tasks")
data class TaskEntity(
    @PrimaryKey
    val id: Long,
    val taskNumber: String,
    val title: String,
    val address: String,
    val description: String,
    val customerName: String? = null,
    val customerPhone: String? = null,
    val lat: Double?,
    val lon: Double?,
    val status: String,
    val priority: Int,
    val createdAt: String,
    val updatedAt: String,
    val plannedDate: String? = null,
    val assignedUserId: Long? = null,
    val assignedUserName: String? = null,
    val isRemote: Boolean = false,
    val isPaid: Boolean = false,
    val paymentAmount: Double = 0.0,
    val systemType: String? = null,
    val defectType: String? = null,
    val commentsCount: Int,
    // Повтор более ранней заявки на том же месте (TaskRepeat); repeatOfId == null — не повтор
    val repeatOfId: Long? = null,
    val repeatTaskNumber: String? = null,
    val repeatIsReturn: Boolean = false,
    val repeatSameDefect: Boolean = false,
    val repeatDate: String? = null,
    val repeatAssigneeName: String? = null,
    val repeatComment: String? = null,
    val dueAt: String? = null,
    // Метаданные для синхронизации
    val lastSyncedAt: Long = System.currentTimeMillis(),
    val isLocallyModified: Boolean = false,
    val pendingStatus: String? = null,
    val pendingComment: String? = null
) {
    /**
     * Конвертация в Domain модель
     */
    fun toDomain(): Task = Task(
        id = id,
        taskNumber = taskNumber,
        title = title,
        address = address,
        description = description,
        customerName = customerName,
        customerPhone = customerPhone,
        lat = lat,
        lon = lon,
        status = TaskStatus.fromString(status),
        priority = Priority.fromInt(priority),
        createdAt = createdAt,
        updatedAt = updatedAt,
        plannedDate = plannedDate,
        assignedUserId = assignedUserId,
        assignedUserName = assignedUserName,
        isRemote = isRemote,
        isPaid = isPaid,
        paymentAmount = paymentAmount,
        systemType = systemType,
        defectType = defectType,
        commentsCount = commentsCount,
        repeatOf = repeatOfId?.let { repeatId ->
            TaskRepeat(
                taskId = repeatId,
                taskNumber = repeatTaskNumber ?: "Z-${repeatId.toString().padStart(5, '0')}",
                isReturn = repeatIsReturn,
                sameDefect = repeatSameDefect,
                date = repeatDate,
                assigneeName = repeatAssigneeName,
                completionComment = repeatComment
            )
        },
        dueAt = dueAt
    )
    
    companion object {
        /**
         * Создание Entity из Domain модели
         */
        fun fromDomain(task: Task): TaskEntity = TaskEntity(
            id = task.id,
            taskNumber = task.taskNumber,
            title = task.title,
            address = task.address,
            description = task.description,
            customerName = task.customerName,
            customerPhone = task.customerPhone,
            lat = task.lat,
            lon = task.lon,
            status = task.status.name,
            priority = task.priority.value,
            createdAt = task.createdAt,
            updatedAt = task.updatedAt,
            plannedDate = task.plannedDate,
            assignedUserId = task.assignedUserId,
            assignedUserName = task.assignedUserName,
            isRemote = task.isRemote,
            isPaid = task.isPaid,
            paymentAmount = task.paymentAmount,
            systemType = task.systemType,
            defectType = task.defectType,
            commentsCount = task.commentsCount,
            repeatOfId = task.repeatOf?.taskId,
            repeatTaskNumber = task.repeatOf?.taskNumber,
            repeatIsReturn = task.repeatOf?.isReturn ?: false,
            repeatSameDefect = task.repeatOf?.sameDefect ?: false,
            repeatDate = task.repeatOf?.date,
            repeatAssigneeName = task.repeatOf?.assigneeName,
            repeatComment = task.repeatOf?.completionComment,
            dueAt = task.dueAt
        )
    }
}
