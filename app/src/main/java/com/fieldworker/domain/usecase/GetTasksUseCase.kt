package com.fieldworker.domain.usecase

import com.fieldworker.data.repository.OfflineFirstTasksRepository
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Task
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
     * Получить Flow всех задач из локальной БД
     */
    val tasksFlow = repository.tasksFlow
    
    /**
     * Получить Flow количества отложенных действий
     */
    val pendingActionsCount = repository.pendingActionsCount
    
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
}
