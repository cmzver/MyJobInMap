package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.repository.TaskRepository
import kotlinx.coroutines.flow.Flow

class ObserveTaskDetailUseCase(
    private val repository: TaskRepository,
) {
    operator fun invoke(taskId: Long): Flow<TaskDetail?> = repository.observeTaskDetail(taskId)
}
