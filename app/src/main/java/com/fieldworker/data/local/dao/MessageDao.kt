package com.fieldworker.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.fieldworker.data.local.entity.MessageEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageDao {

    /**
     * Сообщения беседы — самые новые сверху (как ожидает UI чата).
     */
    @Query(
        """
        SELECT * FROM chat_messages
        WHERE conversation_id = :conversationId
        ORDER BY created_at DESC, id DESC
        """
    )
    fun observeForConversation(conversationId: Long): Flow<List<MessageEntity>>

    @Query(
        """
        SELECT * FROM chat_messages
        WHERE conversation_id = :conversationId
        ORDER BY created_at DESC, id DESC
        LIMIT :limit
        """
    )
    suspend fun getLatest(conversationId: Long, limit: Int): List<MessageEntity>

    /**
     * Старая страница (для бесконечной прокрутки): сообщения с id меньше [beforeId].
     */
    @Query(
        """
        SELECT * FROM chat_messages
        WHERE conversation_id = :conversationId AND id < :beforeId
        ORDER BY created_at DESC, id DESC
        LIMIT :limit
        """
    )
    suspend fun getBefore(conversationId: Long, beforeId: Long, limit: Int): List<MessageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<MessageEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: MessageEntity)

    @Query("DELETE FROM chat_messages WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM chat_messages WHERE conversation_id = :conversationId")
    suspend fun deleteByConversation(conversationId: Long)

    /**
     * Ограничивает кэш беседы: оставляет только последние [keep] сообщений.
     * Защита от безграничного роста БД при долгом использовании.
     */
    @Query(
        """
        DELETE FROM chat_messages
        WHERE conversation_id = :conversationId
          AND id NOT IN (
            SELECT id FROM chat_messages
            WHERE conversation_id = :conversationId
            ORDER BY created_at DESC, id DESC
            LIMIT :keep
          )
        """
    )
    suspend fun trimToLast(conversationId: Long, keep: Int)
}
