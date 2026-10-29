package com.fieldworker.domain.usecase

import androidx.paging.PagingData
import com.fieldworker.data.repository.OfflineFirstTasksRepository
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Task
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * UseCase для работы с задачами.
 * Инкапсулирует бизнес-логику загрузки, обновления и кеширования задач.
 */
@Singleton
class GetTasksUseCase @Inject constructor(
    private val repository: OfflineFirstTasksRepository
) {
    
    /**
     * Получить Flow всех задач из локальной БД (для карты)
     */
    val tasksFlow = repository.tasksFlow
    
    /**
     * Paging 3 Flow задач из Room (для списка).
     * Room автоматически инвалидирует PagingSource при изменениях.
     */
    val tasksPagingFlow: Flow<PagingData<Task>> = repository.tasksPagingFlow
    
    /**
     * Получить Flow количества отложенных действий
     */
    val pendingActionsCount = repository.pendingActionsCount

    /** Офлайн-действия, которые не удалось отправить (dead-letter). */
    val failedActions = repository.failedActions

    suspend fun retryFailedAction(actionId: Long) = repository.retryFailedAction(actionId)

    suspend fun discardFailedAction(actionId: Long) = repository.discardFailedAction(actionId)
    
    /**
     * Обновить список задач (из кеша или сервера)
     */
    suspend fun refreshTasks(): Result<List<Task>> {
        return repository.refreshTasks()
    }
    
    /**
     * Получить детальную информацию о задаче с комментариями
     */
    suspend fun getTaskDetail(taskId: Long): Result<Pair<Task, List<Comment>>> {
        return repository.getTaskDetail(taskId)
    }

    /** То же из локального кеша, без обращения к серверу. */
    suspend fun getCachedTaskDetail(taskId: Long): Result<Pair<Task, List<Comment>>> {
        return repository.getCachedTaskDetail(taskId)
    }
    
    /**
     * Получить время последней синхронизации
     */
    suspend fun getLastSyncTime(): Long? {
        return repository.getLastSyncTime()
    }
    
    /**
     * Проверить, есть ли кешированные данные
     */
    suspend fun hasCachedData(): Boolean {
        return repository.hasCachedData()
    }
    
    /**
     * Очистить локальный кеш (при выходе из аккаунта)
     */
    suspend fun clearCache() {
        repository.clearCache()
    }
    
    /**
     * Обновить планируемую дату выполнения задачи
     */
    suspend fun updatePlannedDate(taskId: Long, plannedDate: String?): Result<Task> {
        return repository.updatePlannedDate(taskId, plannedDate)
    }

    /**
     * Назначить исполнителя заявки (null — снять назначение)
     */
    suspend fun assignTask(taskId: Long, assigneeId: Long?): Result<Task> {
        return repository.assignTask(taskId, assigneeId)
    }
}
