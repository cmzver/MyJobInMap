package com.fieldworker.domain.usecase

import com.fieldworker.data.repository.OfflineFirstTasksRepository
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.domain.model.Task
import javax.inject.Inject
import javax.inject.Singleton

/**
 * UseCase для обновления статуса задачи.
 * Инкапсулирует бизнес-логику смены статуса с комментарием.
 */
@Singleton
class UpdateTaskStatusUseCase @Inject constructor(
    private val repository: OfflineFirstTasksRepository
) {
    
    /**
     * Обновить статус задачи.
     * В offline-режиме сохраняет как pending action.
     * 
     * @param taskId ID задачи
     * @param newStatus Новый статус
     * @param comment Комментарий к изменению
     * @return Result с обновлённой задачей или ошибкой
     */
    suspend operator fun invoke(
        taskId: Long,
        newStatus: TaskStatus,
        comment: String = ""
    ): Result<Task> {
        return repository.updateTaskStatus(taskId, newStatus, comment)
    }
}
