package com.fieldworker.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Локальная копия сообщения чата.
 *
 * `attachmentsJson` / `reactionsJson` хранят JSON-сериализованные списки —
 * для кэша достаточно: они всегда читаются вместе с сообщением, отдельной
 * выборки по полям внутри не требуется.
 *
 * Reply-превью хранится inline — на одном уровне меньше JOIN-ов.
 */
@Entity(
    tableName = "chat_messages",
    indices = [
        Index(value = ["conversation_id", "created_at"]),
        Index(value = ["conversation_id", "id"]),
    ],
)
data class MessageEntity(
    @PrimaryKey
    val id: Long,
    @ColumnInfo(name = "conversation_id") val conversationId: Long,
    @ColumnInfo(name = "sender_id") val senderId: Long,
    @ColumnInfo(name = "sender_name") val senderName: String?,
    val text: String?,
    @ColumnInfo(name = "message_type") val messageType: String,
    @ColumnInfo(name = "is_edited") val isEdited: Boolean,
    @ColumnInfo(name = "is_deleted") val isDeleted: Boolean,
    @ColumnInfo(name = "reply_to_id") val replyToId: Long?,
    @ColumnInfo(name = "reply_to_text") val replyToText: String?,
    @ColumnInfo(name = "reply_to_sender_name") val replyToSenderName: String?,
    @ColumnInfo(name = "attached_task_json") val attachedTaskJson: String? = null,
    @ColumnInfo(name = "attachments_json") val attachmentsJson: String,
    @ColumnInfo(name = "reactions_json") val reactionsJson: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "edited_at") val editedAt: String?,
)
