package com.fieldworker.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Локальная копия беседы из чата для оффлайн-показа списка чатов.
 * Поле `lastMessage*` — inline превью последнего сообщения (то же, что
 * сервер шлёт в `ConversationListItemDto.lastMessage`); вынесено плоско,
 * чтобы не плодить отдельную таблицу под одно поле.
 */
@Entity(tableName = "chat_conversations")
data class ConversationEntity(
    @PrimaryKey
    val id: Long,
    val type: String,
    val name: String?,
    val displayName: String?,
    val avatarUrl: String?,
    val taskId: Long?,
    val unreadCount: Int,
    val isMuted: Boolean,
    val isArchived: Boolean,
    @ColumnInfo(name = "last_message_id") val lastMessageId: Long?,
    @ColumnInfo(name = "last_message_text") val lastMessageText: String?,
    @ColumnInfo(name = "last_message_sender_name") val lastMessageSenderName: String?,
    @ColumnInfo(name = "last_message_created_at") val lastMessageCreatedAt: String?,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String?,
    /**
     * Эпохальная отметка последнего обновления записи на клиенте — позволяет
     * сортировать список и понимать, насколько кэш свежий.
     */
    @ColumnInfo(name = "cached_at") val cachedAt: Long = System.currentTimeMillis(),
)
