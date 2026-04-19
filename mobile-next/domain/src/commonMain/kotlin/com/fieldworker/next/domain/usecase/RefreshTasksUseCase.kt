package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskSummary
import com.fieldworker.next.domain.repository.TaskRepository

class RefreshTasksUseCase(
    private val repository: TaskRepository,
) {
    suspend operator fun invoke(): AppResult<List<TaskSummary>> {
        return repository.refreshAssignedTasks()
    }
}
