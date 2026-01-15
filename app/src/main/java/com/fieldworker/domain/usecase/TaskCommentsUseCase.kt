package com.fieldworker.domain.usecase

import com.fieldworker.data.repository.OfflineFirstTasksRepository
import com.fieldworker.domain.model.Comment
import javax.inject.Inject
import javax.inject.Singleton

/**
 * UseCase для работы с комментариями к задачам.
 * Инкапсулирует бизнес-логику добавления комментариев.
 */
@Singleton
class TaskCommentsUseCase @Inject constructor(
    private val repository: OfflineFirstTasksRepository
) {
    
    /**
     * Добавить комментарий к задаче.
     * В offline-режиме комментарий сохраняется локально и синхронизируется при появлении сети.
     * 
     * @param taskId ID задачи
     * @param text Текст комментария
     * @return Result с созданным комментарием или ошибкой
     */
    suspend fun addComment(taskId: Long, text: String): Result<Comment> {
        if (text.isBlank()) {
            return Result.failure(IllegalArgumentException("Комментарий не может быть пустым"))
        }
        return repository.addComment(taskId, text)
    }
}
