package com.fieldworker.domain.model

import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

// ============================================================================
// Enums
// ============================================================================

enum class ConversationType(val value: String) {
    DIRECT("direct"),
    GROUP("group"),
    TASK("task"),
    ORG_GENERAL("org_general");

    companion object {
        fun fromString(value: String): ConversationType =
            entries.firstOrNull { it.value == value } ?: DIRECT
    }
}

enum class MessageType(val value: String) {
    TEXT("text"),
    SYSTEM("system"),
    ATTACHMENT("attachment");

    companion object {
        fun fromString(value: String): MessageType =
            entries.firstOrNull { it.value == value } ?: TEXT
    }
}

// ============================================================================
// Domain Models
// ============================================================================

data class Conversation(
    val id: Long,
    val type: ConversationType,
    val name: String?,
    val displayName: String?,
    val avatarUrl: String?,
    val taskId: Long?,
    val unreadCount: Int,
    val isMuted: Boolean,
    val isArchived: Boolean,
    val lastMessage: LastMessagePreview?,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime?,
)

data class LastMessagePreview(
    val id: Long,
    val text: String?,
    val senderName: String?,
    val createdAt: LocalDateTime,
)

data class ConversationDetail(
    val id: Long,
    val type: ConversationType,
    val name: String?,
    val displayName: String?,
    val avatarUrl: String?,
    val taskId: Long?,
    val organizationId: Long?,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime?,
    val members: List<ConversationMember>,
)

data class ConversationMember(
    val userId: Long,
    val username: String,
    val fullName: String,
    val avatarUrl: String?,
    val role: String,
    val lastReadMessageId: Long?,
    val isMuted: Boolean,
    val isArchived: Boolean,
)

data class ChatMessage(
    val id: Long,
    val conversationId: Long,
    val senderId: Long,
    val senderName: String?,
    val text: String?,
    val messageType: MessageType,
    val isEdited: Boolean,
    val isDeleted: Boolean,
    val replyTo: ReplyPreview?,
    val attachments: List<ChatAttachment>,
    val reactions: List<ChatReaction>,
    val createdAt: LocalDateTime,
    val editedAt: LocalDateTime?,
) {
    val isSystem: Boolean get() = messageType == MessageType.SYSTEM
}

data class ReplyPreview(
    val id: Long,
    val text: String?,
    val senderName: String?,
)

data class ChatAttachment(
    val id: Long,
    val fileName: String,
    val fileSize: Long,
    val mimeType: String,
    val filePath: String?,
    val thumbnailPath: String?,
) {
    val isImage: Boolean get() = mimeType.startsWith("image/")
}

data class ChatReaction(
    val emoji: String,
    val count: Int,
    val userIds: List<Long>,
) {
    fun isReactedBy(userId: Long): Boolean = userId in userIds
}

// ============================================================================
// Helpers
// ============================================================================

internal val chatDateTimeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")

internal fun parseDateTime(value: String?): LocalDateTime? {
    if (value == null) return null
    return try {
        // Trim microseconds and timezone info for consistency
        val cleaned = value.substringBefore("+").substringBefore("Z").take(19)
        LocalDateTime.parse(cleaned, chatDateTimeFormatter)
    } catch (_: Exception) {
        null
    }
}

internal fun parseDateTimeNonNull(value: String?): LocalDateTime {
    return parseDateTime(value) ?: LocalDateTime.MIN
}
