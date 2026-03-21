package com.fieldworker.data.mapper

import com.fieldworker.data.dto.*
import com.fieldworker.domain.model.*

// ============================================================================
// Conversation mappers
// ============================================================================

fun ConversationListItemDto.toDomain(): Conversation = Conversation(
    id = id,
    type = ConversationType.fromString(type),
    name = name,
    displayName = displayName,
    avatarUrl = avatarUrl,
    taskId = taskId,
    unreadCount = unreadCount,
    isMuted = isMuted,
    isArchived = isArchived,
    lastMessage = lastMessage?.toDomain(),
    createdAt = parseDateTimeNonNull(createdAt),
    updatedAt = parseDateTime(updatedAt),
)

fun LastMessagePreviewDto.toDomain(): LastMessagePreview = LastMessagePreview(
    id = id,
    text = text,
    senderName = senderName,
    createdAt = parseDateTimeNonNull(createdAt),
)

fun ConversationDetailDto.toDomain(): ConversationDetail = ConversationDetail(
    id = id,
    type = ConversationType.fromString(type),
    name = name,
    displayName = displayName,
    avatarUrl = avatarUrl,
    taskId = taskId,
    organizationId = organizationId,
    createdAt = parseDateTimeNonNull(createdAt),
    updatedAt = parseDateTime(updatedAt),
    members = members.map { it.toDomain() },
)

fun MemberInfoDto.toDomain(): ConversationMember = ConversationMember(
    userId = userId,
    username = username,
    fullName = fullName,
    avatarUrl = avatarUrl,
    role = role,
    lastReadMessageId = lastReadMessageId,
    isMuted = isMuted,
    isArchived = isArchived,
)

fun List<MemberInfoDto>.toDomainMembers(): List<ConversationMember> = map { it.toDomain() }

// ============================================================================
// Message mappers
// ============================================================================

fun MessageDto.toDomain(): ChatMessage = ChatMessage(
    id = id,
    conversationId = conversationId,
    senderId = senderId,
    senderName = senderName,
    text = text,
    messageType = MessageType.fromString(messageType),
    isEdited = isEdited,
    isDeleted = isDeleted,
    replyTo = replyTo?.toDomain(),
    attachments = attachments.map { it.toDomain() },
    reactions = reactions.map { it.toDomain() },
    createdAt = parseDateTimeNonNull(createdAt),
    editedAt = parseDateTime(editedAt),
)

fun ReplyPreviewDto.toDomain(): ReplyPreview = ReplyPreview(
    id = id,
    text = text,
    senderName = senderName,
)

fun AttachmentDto.toDomain(): ChatAttachment = ChatAttachment(
    id = id,
    fileName = fileName,
    fileSize = fileSize,
    mimeType = mimeType,
    filePath = filePath,
    thumbnailPath = thumbnailPath,
)

fun ReactionInfoDto.toDomain(): ChatReaction = ChatReaction(
    emoji = emoji,
    count = count,
    userIds = userIds,
)
