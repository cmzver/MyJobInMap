package com.fieldworker.data.mapper

import com.fieldworker.data.remote.generated.AttachmentResponse
import com.fieldworker.data.remote.generated.ConversationDetailResponse
import com.fieldworker.data.remote.generated.ConversationListItem
import com.fieldworker.data.remote.generated.MemberInfo
import com.fieldworker.data.remote.generated.MessageResponse
import com.fieldworker.data.remote.generated.ReactionInfo
import com.fieldworker.data.remote.generated.TaskPreview
import com.fieldworker.data.remote.generated.LastMessagePreview as GenLastMessagePreview
import com.fieldworker.data.remote.generated.ReplyPreview as GenReplyPreview
import com.fieldworker.domain.model.*

// ============================================================================
// Conversation mappers
// ============================================================================

fun ConversationListItem.toDomain(): Conversation = Conversation(
    id = id,
    type = ConversationType.fromString(type.value),
    name = name,
    // Сервер не отдаёт display_name/created_at для элемента списка (см. схему
    // ConversationListItem) — UI подставляет name, сортировка идёт по
    // last_message/updated_at, поэтому created_at тут не используется.
    displayName = null,
    avatarUrl = avatarUrl,
    taskId = taskId,
    unreadCount = unreadCount?.toInt() ?: 0,
    isMuted = isMuted ?: false,
    isArchived = isArchived ?: false,
    lastMessage = lastMessage?.toDomain(),
    createdAt = parseDateTimeNonNull(null),
    updatedAt = parseDateTime(updatedAt),
)

fun GenLastMessagePreview.toDomain(): LastMessagePreview = LastMessagePreview(
    id = id,
    text = text,
    senderName = senderName,
    createdAt = parseDateTimeNonNull(createdAt),
)

fun ConversationDetailResponse.toDomain(): ConversationDetail = ConversationDetail(
    id = id,
    type = ConversationType.fromString(type.value),
    name = name,
    displayName = null,
    avatarUrl = avatarUrl,
    taskId = taskId,
    organizationId = organizationId,
    createdAt = parseDateTimeNonNull(createdAt),
    updatedAt = parseDateTime(updatedAt),
    members = members.orEmpty().map { it.toDomain() },
)

fun MemberInfo.toDomain(): ConversationMember = ConversationMember(
    userId = userId,
    username = username,
    fullName = fullName,
    avatarUrl = avatarUrl,
    role = role.value,
    lastReadMessageId = lastReadMessageId,
    isMuted = isMuted ?: false,
    isArchived = isArchived ?: false,
)

fun List<MemberInfo>.toDomainMembers(): List<ConversationMember> = map { it.toDomain() }

// ============================================================================
// Message mappers
// ============================================================================

fun MessageResponse.toDomain(): ChatMessage = ChatMessage(
    id = id,
    conversationId = conversationId,
    senderId = senderId,
    senderName = senderName,
    text = text,
    messageType = messageType?.let { MessageType.fromString(it.value) } ?: MessageType.TEXT,
    isEdited = isEdited ?: false,
    isDeleted = isDeleted ?: false,
    replyTo = replyTo?.toDomain(),
    attachedTask = attachedTask?.toDomain(),
    attachments = attachments.orEmpty().map { it.toDomain() },
    reactions = reactions.orEmpty().map { it.toDomain() },
    createdAt = parseDateTimeNonNull(createdAt),
    editedAt = parseDateTime(editedAt),
)

fun GenReplyPreview.toDomain(): ReplyPreview = ReplyPreview(
    id = id,
    text = text,
    senderName = senderName,
)

fun TaskPreview.toDomain(): TaskReference = TaskReference(
    id = id,
    taskNumber = taskNumber,
    title = title,
    status = status,
    priority = priority,
    rawAddress = rawAddress,
    accessible = accessible ?: true,
)

fun AttachmentResponse.toDomain(): ChatAttachment = ChatAttachment(
    id = id,
    fileName = fileName,
    fileSize = fileSize,
    mimeType = mimeType,
    filePath = filePath,
    thumbnailPath = thumbnailPath,
)

fun ReactionInfo.toDomain(): ChatReaction = ChatReaction(
    emoji = emoji,
    count = count.toInt(),
    userIds = userIds.orEmpty(),
)
