package com.fieldworker.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.fieldworker.data.local.entity.ConversationEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConversationDao {

    @Query(
        """
        SELECT * FROM chat_conversations
        ORDER BY
          COALESCE(last_message_created_at, updated_at, created_at) DESC,
          id DESC
        """
    )
    fun observeAll(): Flow<List<ConversationEntity>>

    @Query(
        """
        SELECT * FROM chat_conversations
        ORDER BY
          COALESCE(last_message_created_at, updated_at, created_at) DESC,
          id DESC
        """
    )
    suspend fun getAll(): List<ConversationEntity>

    @Query("SELECT * FROM chat_conversations WHERE id = :id LIMIT 1")
    suspend fun getById(id: Long): ConversationEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<ConversationEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: ConversationEntity)

    @Query("DELETE FROM chat_conversations WHERE id NOT IN (:ids)")
    suspend fun deleteNotIn(ids: List<Long>)

    @Query("DELETE FROM chat_conversations")
    suspend fun deleteAll()

    @Query("UPDATE chat_conversations SET unreadCount = :count WHERE id = :id")
    suspend fun setUnreadCount(id: Long, count: Int)

    @Query("UPDATE chat_conversations SET isMuted = :isMuted WHERE id = :id")
    suspend fun setMuted(id: Long, isMuted: Boolean)

    @Query("UPDATE chat_conversations SET isArchived = :isArchived WHERE id = :id")
    suspend fun setArchived(id: Long, isArchived: Boolean)
}
