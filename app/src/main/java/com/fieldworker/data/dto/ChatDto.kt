package com.fieldworker.data.dto

import kotlinx.serialization.Serializable

// ============================================================================
// Conversations
// ============================================================================

@Serializable
data class ConversationListItemDto(
    val id: Long,
    val type: String,
    val name: String?,
    val displayName: String?,
    val avatarUrl: String?,
    val taskId: Long?,
    val unreadCount: Int,
    val isMuted: Boolean,
    val isArchived: Boolean,
    val lastMessage: LastMessagePreviewDto?,
    val createdAt: String,
    val updatedAt: String?,
)

@Serializable
data class LastMessagePreviewDto(
    val id: Long,
    val text: String?,
    val senderName: String?,
    val createdAt: String,
)

@Serializable
data class ConversationDetailDto(
    val id: Long,
    val type: String,
    val name: String?,
    val displayName: String?,
    val avatarUrl: String?,
    val taskId: Long?,
    val organizationId: Long?,
    val createdAt: String,
    val updatedAt: String?,
    val members: List<MemberInfoDto>,
)

@Serializable
data class MemberInfoDto(
    val userId: Long,
    val username: String,
    val fullName: String,
    val avatarUrl: String?,
    val role: String,
    val lastReadMessageId: Long?,
    val isMuted: Boolean,
    val isArchived: Boolean,
    val joinedAt: String?,
)

@Serializable
data class ConversationCreateDto(
    val type: String,
    val name: String? = null,
    val taskId: Long? = null,
    val memberUserIds: List<Long> = emptyList(),
)

@Serializable
data class ConversationResponseDto(
    val id: Long,
    val type: String,
    val name: String?,
    val taskId: Long?,
    val createdAt: String,
)

@Serializable
data class ConversationUpdateDto(
    val name: String? = null,
    val avatarUrl: String? = null,
)

@Serializable
data class MemberAddRequestDto(
    val userIds: List<Long>,
)

@Serializable
data class MemberRoleUpdateRequestDto(
    val role: String,
)

@Serializable
data class OwnershipTransferRequestDto(
    val userId: Long,
)

// ============================================================================
// Messages
// ============================================================================

@Serializable
data class MessageDto(
    val id: Long,
    val conversationId: Long,
    val senderId: Long,
    val senderName: String?,
    val text: String?,
    val messageType: String,
    val isEdited: Boolean,
    val isDeleted: Boolean,
    val replyTo: ReplyPreviewDto?,
    val attachedTask: TaskPreviewDto? = null,
    val attachments: List<AttachmentDto>,
    val reactions: List<ReactionInfoDto>,
    val mentions: List<MentionDto>,
    val createdAt: String,
    val editedAt: String?,
)

@Serializable
data class ReplyPreviewDto(
    val id: Long,
    val text: String?,
    val senderName: String?,
)

@Serializable
data class TaskPreviewDto(
    val id: Long,
    val taskNumber: String?,
    val title: String?,
    val status: String?,
    val priority: String?,
    val rawAddress: String?,
    val accessible: Boolean = true,
)

@Serializable
data class AttachmentDto(
    val id: Long,
    val fileName: String,
    val fileSize: Long,
    val mimeType: String,
    val filePath: String?,
    val thumbnailPath: String?,
)

@Serializable
data class ReactionInfoDto(
    val emoji: String,
    val count: Int,
    val userIds: List<Long>,
)

@Serializable
data class MentionDto(
    val userId: Long,
    val username: String,
    val offset: Int,
    val length: Int,
)

@Serializable
data class MessageListDto(
    val items: List<MessageDto>,
    val hasMore: Boolean,
)

@Serializable
data class MessageCreateDto(
    val text: String?,
    val replyToId: Long? = null,
    val messageType: String = "text",
    val taskId: Long? = null,
)

@Serializable
data class MessageUpdateDto(
    val text: String,
)

@Serializable
data class ReactionCreateDto(
    val emoji: String,
)

@Serializable
data class ReadReceiptDto(
    val lastMessageId: Long,
)

@Serializable
data class MuteRequestDto(
    val isMuted: Boolean,
)

@Serializable
data class ArchiveRequestDto(
    val isArchived: Boolean,
)
