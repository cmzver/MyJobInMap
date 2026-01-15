package com.fieldworker.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
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
    val lat: Double?,
    val lon: Double?,
    val status: String,
    val priority: Int,
    val createdAt: String,
    val updatedAt: String,
    val plannedDate: String? = null,
    val commentsCount: Int,
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
        lat = lat,
        lon = lon,
        status = TaskStatus.fromString(status),
        priority = Priority.fromInt(priority),
        createdAt = createdAt,
        updatedAt = updatedAt,
        plannedDate = plannedDate,
        commentsCount = commentsCount
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
            lat = task.lat,
            lon = task.lon,
            status = task.status.name,
            priority = task.priority.value,
            createdAt = task.createdAt,
            updatedAt = task.updatedAt,
            plannedDate = task.plannedDate,
            commentsCount = task.commentsCount
        )
    }
}
