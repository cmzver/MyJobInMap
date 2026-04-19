package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.repository.TaskRepository

class UpdateTaskStatusUseCase(
    private val repository: TaskRepository,
) {
    suspend operator fun invoke(
        taskId: Long,
        newStatus: TaskStatus,
        comment: String,
    ): AppResult<TaskDetail> {
        val normalizedComment = comment.trim()
        if (requiresComment(newStatus) && normalizedComment.isBlank()) {
            return AppResult.Failure(
                AppError.Validation("Comment is required for status $newStatus")
            )
        }

        return repository.updateTaskStatus(
            taskId = taskId,
            newStatus = newStatus,
            comment = normalizedComment.ifBlank { null },
        )
    }

    private fun requiresComment(status: TaskStatus): Boolean {
        return status == TaskStatus.DONE || status == TaskStatus.CANCELLED
    }
}
