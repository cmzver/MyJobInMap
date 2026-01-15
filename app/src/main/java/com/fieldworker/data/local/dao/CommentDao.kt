package com.fieldworker.data.local.dao

import androidx.room.*
import com.fieldworker.data.local.entity.CommentEntity
import kotlinx.coroutines.flow.Flow

/**
 * DAO для работы с таблицей комментариев.
 */
@Dao
interface CommentDao {
    
    /**
     * Получить все комментарии к задаче как Flow
     */
    @Query("SELECT * FROM comments WHERE taskId = :taskId ORDER BY createdAt ASC")
    fun getCommentsForTaskFlow(taskId: Long): Flow<List<CommentEntity>>
    
    /**
     * Получить все комментарии к задаче (suspend)
     */
    @Query("SELECT * FROM comments WHERE taskId = :taskId ORDER BY createdAt ASC")
    suspend fun getCommentsForTask(taskId: Long): List<CommentEntity>
    
    /**
     * Получить локальные комментарии, ожидающие синхронизации
     */
    @Query("SELECT * FROM comments WHERE isLocalOnly = 1")
    suspend fun getLocalOnlyComments(): List<CommentEntity>
    
    /**
     * Вставить или обновить комментарий
     */
    @Upsert
    suspend fun upsertComment(comment: CommentEntity)
    
    /**
     * Вставить или обновить список комментариев
     */
    @Upsert
    suspend fun upsertComments(comments: List<CommentEntity>)
    
    /**
     * Удалить комментарий
     */
    @Delete
    suspend fun deleteComment(comment: CommentEntity)
    
    /**
     * Удалить все комментарии к задаче
     */
    @Query("DELETE FROM comments WHERE taskId = :taskId")
    suspend fun deleteCommentsForTask(taskId: Long)
    
    /**
     * Удалить локальный комментарий по tempId после синхронизации
     */
    @Query("DELETE FROM comments WHERE tempId = :tempId")
    suspend fun deleteByTempId(tempId: String)
    
    /**
     * Обновить локальный комментарий реальным ID
     */
    @Query("""
        UPDATE comments 
        SET id = :realId, isLocalOnly = 0, tempId = NULL 
        WHERE tempId = :tempId
    """)
    suspend fun updateWithRealId(tempId: String, realId: Long)
}
