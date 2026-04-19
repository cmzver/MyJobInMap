package com.fieldworker.next.data.remote.mapper

import com.fieldworker.next.data.remote.model.PortalConversationListItemDto
import com.fieldworker.next.data.remote.model.PortalLastMessagePreviewDto
import com.fieldworker.next.data.remote.model.PortalMessageDto
import com.fieldworker.next.data.remote.model.PortalReactionInfoDto
import com.fieldworker.next.data.remote.model.PortalReplyPreviewDto
import com.fieldworker.next.domain.model.ChatMessage
import com.fieldworker.next.domain.model.Conversation
import com.fieldworker.next.domain.model.ConversationType
import com.fieldworker.next.domain.model.LastMessagePreview
import com.fieldworker.next.domain.model.ReactionInfo
import com.fieldworker.next.domain.model.ReplyPreview

fun PortalConversationListItemDto.toConversation(): Conversation {
    return Conversation(
        id = id,
        type = type.toDomainConversationType(),
        name = name,
        avatarUrl = avatarUrl,
        taskId = taskId,
        lastMessage = lastMessage?.toLastMessagePreview(),
        unreadCount = unreadCount,
        isMuted = isMuted,
        isArchived = isArchived,
        updatedAt = updatedAt,
    )
}

fun PortalLastMessagePreviewDto.toLastMessagePreview(): LastMessagePreview {
    return LastMessagePreview(
        id = id,
        text = text,
        senderName = senderName,
        messageType = messageType,
        createdAt = createdAt,
    )
}

fun PortalMessageDto.toChatMessage(currentUserId: Long): ChatMessage {
    return ChatMessage(
        id = id,
        conversationId = conversationId,
        senderId = senderId,
        senderName = senderName,
        senderUsername = senderUsername,
        text = text,
        messageType = messageType,
        replyTo = replyTo?.toReplyPreview(),
        reactions = reactions.map { it.toReactionInfo() },
        isEdited = isEdited,
        isDeleted = isDeleted,
        createdAt = createdAt,
        editedAt = editedAt,
        isMine = senderId == currentUserId,
    )
}

fun PortalReplyPreviewDto.toReplyPreview(): ReplyPreview {
    return ReplyPreview(
        id = id,
        text = text,
        senderId = senderId,
        senderName = senderName,
    )
}

fun PortalReactionInfoDto.toReactionInfo(): ReactionInfo {
    return ReactionInfo(
        emoji = emoji,
        count = count,
        userIds = userIds,
        userNames = userNames,
    )
}

private fun String.toDomainConversationType(): ConversationType = when (this) {
    "direct" -> ConversationType.DIRECT
    "group" -> ConversationType.GROUP
    "task" -> ConversationType.TASK
    "org_general" -> ConversationType.ORG_GENERAL
    else -> ConversationType.DIRECT
}
