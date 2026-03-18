package com.fieldworker.data.dto

import com.google.gson.annotations.SerializedName

// ============================================================================
// Conversations
// ============================================================================

data class ConversationListItemDto(
    @SerializedName("id") val id: Long,
    @SerializedName("type") val type: String,
    @SerializedName("name") val name: String?,
    @SerializedName("display_name") val displayName: String?,
    @SerializedName("avatar_url") val avatarUrl: String?,
    @SerializedName("task_id") val taskId: Long?,
    @SerializedName("unread_count") val unreadCount: Int,
    @SerializedName("is_muted") val isMuted: Boolean,
    @SerializedName("is_archived") val isArchived: Boolean,
    @SerializedName("last_message") val lastMessage: LastMessagePreviewDto?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String?,
)

data class LastMessagePreviewDto(
    @SerializedName("id") val id: Long,
    @SerializedName("text") val text: String?,
    @SerializedName("sender_name") val senderName: String?,
    @SerializedName("created_at") val createdAt: String,
)

data class ConversationDetailDto(
    @SerializedName("id") val id: Long,
    @SerializedName("type") val type: String,
    @SerializedName("name") val name: String?,
    @SerializedName("display_name") val displayName: String?,
    @SerializedName("avatar_url") val avatarUrl: String?,
    @SerializedName("task_id") val taskId: Long?,
    @SerializedName("organization_id") val organizationId: Long?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String?,
    @SerializedName("members") val members: List<MemberInfoDto>,
)

data class MemberInfoDto(
    @SerializedName("user_id") val userId: Long,
    @SerializedName("username") val username: String,
    @SerializedName("full_name") val fullName: String,
    @SerializedName("role") val role: String,
    @SerializedName("last_read_message_id") val lastReadMessageId: Long?,
    @SerializedName("is_muted") val isMuted: Boolean,
    @SerializedName("is_archived") val isArchived: Boolean,
    @SerializedName("joined_at") val joinedAt: String?,
)

data class ConversationCreateDto(
    @SerializedName("type") val type: String,
    @SerializedName("name") val name: String? = null,
    @SerializedName("task_id") val taskId: Long? = null,
    @SerializedName("member_user_ids") val memberUserIds: List<Long> = emptyList(),
)

data class ConversationResponseDto(
    @SerializedName("id") val id: Long,
    @SerializedName("type") val type: String,
    @SerializedName("name") val name: String?,
    @SerializedName("task_id") val taskId: Long?,
    @SerializedName("created_at") val createdAt: String,
)

data class ConversationUpdateDto(
    @SerializedName("name") val name: String? = null,
    @SerializedName("avatar_url") val avatarUrl: String? = null,
)

data class MemberAddRequestDto(
    @SerializedName("user_ids") val userIds: List<Long>,
)

data class MemberRoleUpdateRequestDto(
    @SerializedName("role") val role: String,
)

data class OwnershipTransferRequestDto(
    @SerializedName("user_id") val userId: Long,
)

// ============================================================================
// Messages
// ============================================================================

data class MessageDto(
    @SerializedName("id") val id: Long,
    @SerializedName("conversation_id") val conversationId: Long,
    @SerializedName("sender_id") val senderId: Long,
    @SerializedName("sender_name") val senderName: String?,
    @SerializedName("text") val text: String?,
    @SerializedName("message_type") val messageType: String,
    @SerializedName("is_edited") val isEdited: Boolean,
    @SerializedName("is_deleted") val isDeleted: Boolean,
    @SerializedName("reply_to") val replyTo: ReplyPreviewDto?,
    @SerializedName("attachments") val attachments: List<AttachmentDto>,
    @SerializedName("reactions") val reactions: List<ReactionInfoDto>,
    @SerializedName("mentions") val mentions: List<MentionDto>,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("edited_at") val editedAt: String?,
)

data class ReplyPreviewDto(
    @SerializedName("id") val id: Long,
    @SerializedName("text") val text: String?,
    @SerializedName("sender_name") val senderName: String?,
)

data class AttachmentDto(
    @SerializedName("id") val id: Long,
    @SerializedName("file_name") val fileName: String,
    @SerializedName("file_size") val fileSize: Long,
    @SerializedName("mime_type") val mimeType: String,
    @SerializedName("file_path") val filePath: String?,
    @SerializedName("thumbnail_path") val thumbnailPath: String?,
)

data class ReactionInfoDto(
    @SerializedName("emoji") val emoji: String,
    @SerializedName("count") val count: Int,
    @SerializedName("user_ids") val userIds: List<Long>,
)

data class MentionDto(
    @SerializedName("user_id") val userId: Long,
    @SerializedName("username") val username: String,
    @SerializedName("offset") val offset: Int,
    @SerializedName("length") val length: Int,
)

data class MessageListDto(
    @SerializedName("items") val items: List<MessageDto>,
    @SerializedName("has_more") val hasMore: Boolean,
)

data class MessageCreateDto(
    @SerializedName("text") val text: String?,
    @SerializedName("reply_to_id") val replyToId: Long? = null,
    @SerializedName("message_type") val messageType: String = "text",
)

data class MessageUpdateDto(
    @SerializedName("text") val text: String,
)

data class ReactionCreateDto(
    @SerializedName("emoji") val emoji: String,
)

data class ReadReceiptDto(
    @SerializedName("last_message_id") val lastMessageId: Long,
)

data class MuteRequestDto(
    @SerializedName("is_muted") val isMuted: Boolean,
)

data class ArchiveRequestDto(
    @SerializedName("is_archived") val isArchived: Boolean,
)
