package com.fieldworker.data.local.dao

import androidx.room.*
import com.fieldworker.data.local.entity.TaskEntity
import kotlinx.coroutines.flow.Flow

/**
 * DAO для работы с таблицей задач.
 */
@Dao
interface TaskDao {
    
    /**
     * Получить все задачи как Flow для реактивного обновления UI
     */
    @Query("SELECT * FROM tasks ORDER BY priority DESC, createdAt DESC")
    fun getAllTasksFlow(): Flow<List<TaskEntity>>
    
    /**
     * Получить все задачи (suspend)
     */
    @Query("SELECT * FROM tasks ORDER BY priority DESC, createdAt DESC")
    suspend fun getAllTasks(): List<TaskEntity>
    
    /**
     * Получить задачу по ID
     */
    @Query("SELECT * FROM tasks WHERE id = :taskId")
    suspend fun getTaskById(taskId: Long): TaskEntity?
    
    /**
     * Получить задачу по ID как Flow
     */
    @Query("SELECT * FROM tasks WHERE id = :taskId")
    fun getTaskByIdFlow(taskId: Long): Flow<TaskEntity?>
    
    /**
     * Получить задачи с локальными изменениями (для синхронизации)
     */
    @Query("SELECT * FROM tasks WHERE isLocallyModified = 1")
    suspend fun getLocallyModifiedTasks(): List<TaskEntity>
    
    /**
     * Вставить или обновить задачу
     */
    @Upsert
    suspend fun upsertTask(task: TaskEntity)
    
    /**
     * Вставить или обновить список задач
     */
    @Upsert
    suspend fun upsertTasks(tasks: List<TaskEntity>)
    
    /**
     * Удалить задачу
     */
    @Delete
    suspend fun deleteTask(task: TaskEntity)
    
    /**
     * Удалить все задачи
     */
    @Query("DELETE FROM tasks")
    suspend fun deleteAllTasks()
    
    /**
     * Удалить задачи, которых нет в списке (для синхронизации)
     */
    @Query("DELETE FROM tasks WHERE id NOT IN (:ids) AND isLocallyModified = 0")
    suspend fun deleteTasksNotIn(ids: List<Long>)
    
    /**
     * Обновить статус задачи локально
     */
    @Query("""
        UPDATE tasks 
        SET status = :status, 
            isLocallyModified = 1,
            pendingStatus = :pendingStatus,
            pendingComment = :comment
        WHERE id = :taskId
    """)
    suspend fun updateStatusLocally(
        taskId: Long, 
        status: String, 
        pendingStatus: String,
        comment: String?
    )
    
    /**
     * Пометить задачу как синхронизированную
     */
    @Query("""
        UPDATE tasks 
        SET isLocallyModified = 0,
            pendingStatus = NULL,
            pendingComment = NULL,
            lastSyncedAt = :syncedAt
        WHERE id = :taskId
    """)
    suspend fun markAsSynced(taskId: Long, syncedAt: Long = System.currentTimeMillis())
    
    /**
     * Получить время последней синхронизации
     */
    @Query("SELECT MAX(lastSyncedAt) FROM tasks")
    suspend fun getLastSyncTime(): Long?
    
    /**
     * Количество задач
     */
    @Query("SELECT COUNT(*) FROM tasks")
    suspend fun getTasksCount(): Int
    
    /**
     * Получить задачи по статусу
     */
    @Query("SELECT * FROM tasks WHERE status = :status ORDER BY priority DESC, createdAt DESC")
    fun getTasksByStatusFlow(status: String): Flow<List<TaskEntity>>
}
