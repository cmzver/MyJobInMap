package com.fieldworker.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.TaskStatus

/**
 * Room Entity для хранения комментариев в локальной БД.
 */
@Entity(
    tableName = "comments",
    foreignKeys = [
        ForeignKey(
            entity = TaskEntity::class,
            parentColumns = ["id"],
            childColumns = ["taskId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("taskId")]
)
data class CommentEntity(
    @PrimaryKey
    val id: Long,
    val taskId: Long,
    val text: String,
    val author: String,
    val oldStatus: String?,
    val newStatus: String?,
    val createdAt: String,
    // Для локально созданных комментариев
    val isLocalOnly: Boolean = false,
    val tempId: String? = null
) {
    /**
     * Конвертация в Domain модель
     */
    fun toDomain(): Comment = Comment(
        id = id,
        taskId = taskId,
        text = text,
        author = author,
        oldStatus = oldStatus?.let { TaskStatus.fromString(it) },
        newStatus = newStatus?.let { TaskStatus.fromString(it) },
        createdAt = createdAt
    )
    
    companion object {
        /**
         * Создание Entity из Domain модели
         */
        fun fromDomain(comment: Comment): CommentEntity = CommentEntity(
            id = comment.id,
            taskId = comment.taskId,
            text = comment.text,
            author = comment.author,
            oldStatus = comment.oldStatus?.name,
            newStatus = comment.newStatus?.name,
            createdAt = comment.createdAt
        )
    }
}
