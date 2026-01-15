package com.fieldworker.data.local.dao

import androidx.room.*
import com.fieldworker.data.local.entity.ActionType
import com.fieldworker.data.local.entity.PendingAction
import kotlinx.coroutines.flow.Flow

/**
 * DAO для работы с отложенными действиями.
 * Используется для синхронизации при появлении сети.
 */
@Dao
interface PendingActionDao {
    
    /**
     * Получить все отложенные действия
     */
    @Query("SELECT * FROM pending_actions ORDER BY createdAt ASC")
    suspend fun getAllPendingActions(): List<PendingAction>
    
    /**
     * Получить количество отложенных действий как Flow
     */
    @Query("SELECT COUNT(*) FROM pending_actions")
    fun getPendingActionsCountFlow(): Flow<Int>
    
    /**
     * Получить количество отложенных действий
     */
    @Query("SELECT COUNT(*) FROM pending_actions")
    suspend fun getPendingActionsCount(): Int
    
    /**
     * Получить отложенные действия для задачи
     */
    @Query("SELECT * FROM pending_actions WHERE taskId = :taskId ORDER BY createdAt ASC")
    suspend fun getPendingActionsForTask(taskId: Long): List<PendingAction>
    
    /**
     * Вставить отложенное действие
     */
    @Insert
    suspend fun insertPendingAction(action: PendingAction): Long
    
    /**
     * Удалить отложенное действие
     */
    @Delete
    suspend fun deletePendingAction(action: PendingAction)
    
    /**
     * Удалить отложенное действие по ID
     */
    @Query("DELETE FROM pending_actions WHERE id = :actionId")
    suspend fun deletePendingActionById(actionId: Long)
    
    /**
     * Удалить все отложенные действия для задачи
     */
    @Query("DELETE FROM pending_actions WHERE taskId = :taskId")
    suspend fun deletePendingActionsForTask(taskId: Long)
    
    /**
     * Удалить все отложенные действия
     */
    @Query("DELETE FROM pending_actions")
    suspend fun deleteAllPendingActions()
    
    /**
     * Инкрементировать счётчик попыток и сохранить ошибку
     */
    @Query("""
        UPDATE pending_actions 
        SET retryCount = retryCount + 1, lastError = :error 
        WHERE id = :actionId
    """)
    suspend fun incrementRetryCount(actionId: Long, error: String?)
    
    /**
     * Получить действия с превышенным количеством попыток
     */
    @Query("SELECT * FROM pending_actions WHERE retryCount >= :maxRetries")
    suspend fun getFailedActions(maxRetries: Int = 5): List<PendingAction>
}
