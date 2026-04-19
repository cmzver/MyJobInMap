package com.fieldworker.next.data.remote.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PortalConversationListItemDto(
    val id: Long,
    val type: String,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("task_id") val taskId: Long? = null,
    @SerialName("last_message") val lastMessage: PortalLastMessagePreviewDto? = null,
    @SerialName("unread_count") val unreadCount: Int = 0,
    @SerialName("unread_mention_count") val unreadMentionCount: Int = 0,
    @SerialName("is_muted") val isMuted: Boolean = false,
    @SerialName("is_archived") val isArchived: Boolean = false,
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class PortalLastMessagePreviewDto(
    val id: Long,
    val text: String? = null,
    @SerialName("sender_name") val senderName: String = "",
    @SerialName("message_type") val messageType: String = "text",
    @SerialName("created_at") val createdAt: String = "",
)

@Serializable
data class PortalMessageDto(
    val id: Long,
    @SerialName("conversation_id") val conversationId: Long,
    @SerialName("sender_id") val senderId: Long,
    @SerialName("sender_name") val senderName: String = "",
    @SerialName("sender_username") val senderUsername: String = "",
    val text: String? = null,
    @SerialName("message_type") val messageType: String = "text",
    @SerialName("reply_to") val replyTo: PortalReplyPreviewDto? = null,
    val reactions: List<PortalReactionInfoDto> = emptyList(),
    @SerialName("is_edited") val isEdited: Boolean = false,
    @SerialName("is_deleted") val isDeleted: Boolean = false,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("edited_at") val editedAt: String? = null,
)

@Serializable
data class PortalReplyPreviewDto(
    val id: Long,
    val text: String? = null,
    @SerialName("sender_id") val senderId: Long = 0,
    @SerialName("sender_name") val senderName: String = "",
)

@Serializable
data class PortalReactionInfoDto(
    val emoji: String,
    val count: Int = 0,
    @SerialName("user_ids") val userIds: List<Long> = emptyList(),
    @SerialName("user_names") val userNames: List<String> = emptyList(),
)

@Serializable
data class PortalMessageListDto(
    val items: List<PortalMessageDto> = emptyList(),
    @SerialName("has_more") val hasMore: Boolean = false,
)

@Serializable
data class PortalSendMessageRequest(
    val text: String,
    @SerialName("reply_to_id") val replyToId: Long? = null,
    @SerialName("message_type") val messageType: String = "text",
)

@Serializable
data class PortalReadReceiptRequest(
    @SerialName("last_message_id") val lastMessageId: Long,
)

@Serializable
data class PortalReactionRequest(
    val emoji: String,
)
