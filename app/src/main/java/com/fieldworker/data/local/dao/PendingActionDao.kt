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
     * Все отложенные действия в порядке создания. Какие из них отправлять и в
     * каком порядке, решает очередь по [ActionType].
     */
    @Query("SELECT * FROM pending_actions ORDER BY createdAt ASC, id ASC")
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

    /** Фото заявки, ещё не дошедшие до сервера. */
    @Query("""
        SELECT * FROM pending_actions
        WHERE taskId = :taskId AND actionType = 'UPLOAD_PHOTO'
        ORDER BY createdAt ASC, id ASC
    """)
    fun getPendingPhotosFlow(taskId: Long): Flow<List<PendingAction>>

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

    @Query("""
        UPDATE pending_actions
        SET retryCount = :maxRetries, lastError = :error
        WHERE id = :actionId
    """)
    suspend fun markAsFailed(actionId: Long, error: String?, maxRetries: Int)
    
    /**
     * Получить действия с превышенным количеством попыток
     */
    @Query("SELECT * FROM pending_actions WHERE retryCount >= :maxRetries")
    suspend fun getFailedActions(maxRetries: Int = 5): List<PendingAction>

    /** Dead-letter: действия, которые очередь больше не повторяет сама. */
    @Query("SELECT * FROM pending_actions WHERE retryCount >= :maxRetries ORDER BY createdAt ASC, id ASC")
    fun getFailedActionsFlow(maxRetries: Int): Flow<List<PendingAction>>

    @Query("SELECT * FROM pending_actions WHERE id = :actionId")
    suspend fun getPendingActionById(actionId: Long): PendingAction?

    /** Вернуть действие в очередь (ручной «Повторить»). */
    @Query("UPDATE pending_actions SET retryCount = 0, lastError = NULL WHERE id = :actionId")
    suspend fun resetRetries(actionId: Long)
}
