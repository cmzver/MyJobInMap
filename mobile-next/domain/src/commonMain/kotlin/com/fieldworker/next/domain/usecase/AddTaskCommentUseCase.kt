package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskComment
import com.fieldworker.next.domain.repository.TaskRepository

class AddTaskCommentUseCase(
    private val repository: TaskRepository,
) {
    suspend operator fun invoke(
        taskId: Long,
        message: String,
    ): AppResult<TaskComment> {
        val normalizedMessage = message.trim()
        if (normalizedMessage.isBlank()) {
            return AppResult.Failure(AppError.Validation("Comment message is required"))
        }

        return repository.addTaskComment(
            taskId = taskId,
            message = normalizedMessage,
        )
    }
}
