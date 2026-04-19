package com.fieldworker.next.domain.model

data class Conversation(
    val id: Long,
    val type: ConversationType,
    val name: String?,
    val avatarUrl: String?,
    val taskId: Long?,
    val lastMessage: LastMessagePreview?,
    val unreadCount: Int,
    val isMuted: Boolean,
    val isArchived: Boolean,
    val updatedAt: String,
)

enum class ConversationType {
    DIRECT,
    GROUP,
    TASK,
    ORG_GENERAL,
}

data class LastMessagePreview(
    val id: Long,
    val text: String?,
    val senderName: String,
    val messageType: String,
    val createdAt: String,
)

data class ChatMessage(
    val id: Long,
    val conversationId: Long,
    val senderId: Long,
    val senderName: String,
    val senderUsername: String,
    val text: String?,
    val messageType: String,
    val replyTo: ReplyPreview?,
    val reactions: List<ReactionInfo>,
    val isEdited: Boolean,
    val isDeleted: Boolean,
    val createdAt: String,
    val editedAt: String?,
    val isMine: Boolean,
)

data class ReplyPreview(
    val id: Long,
    val text: String?,
    val senderId: Long,
    val senderName: String,
)

data class ReactionInfo(
    val emoji: String,
    val count: Int,
    val userIds: List<Long>,
    val userNames: List<String>,
)

data class ChatMessagePage(
    val items: List<ChatMessage>,
    val hasMore: Boolean,
)
