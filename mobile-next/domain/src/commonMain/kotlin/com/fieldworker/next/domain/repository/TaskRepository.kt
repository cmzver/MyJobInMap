package com.fieldworker.next.domain.repository

import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskComment
import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.model.TaskPhoto
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.model.TaskSummary
import kotlinx.coroutines.flow.Flow

interface TaskRepository {
    fun observeAssignedTasks(): Flow<List<TaskSummary>>

    fun observeTaskDetail(taskId: Long): Flow<TaskDetail?>

    suspend fun refreshAssignedTasks(): AppResult<List<TaskSummary>>

    suspend fun updateTaskStatus(
        taskId: Long,
        newStatus: TaskStatus,
        comment: String?,
    ): AppResult<TaskDetail>

    suspend fun addTaskComment(
        taskId: Long,
        message: String,
    ): AppResult<TaskComment>

    suspend fun uploadPhoto(
        taskId: Long,
        fileName: String,
        fileBytes: ByteArray,
        mimeType: String,
    ): AppResult<TaskPhoto>
}
