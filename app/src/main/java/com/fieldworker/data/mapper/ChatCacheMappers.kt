package com.fieldworker.data.mapper

import com.fieldworker.data.local.entity.ConversationEntity
import com.fieldworker.data.local.entity.MessageEntity
import com.fieldworker.domain.model.ChatAttachment
import com.fieldworker.domain.model.ChatMessage
import com.fieldworker.domain.model.ChatReaction
import com.fieldworker.domain.model.Conversation
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.domain.model.LastMessagePreview
import com.fieldworker.domain.model.MessageType
import com.fieldworker.domain.model.ReplyPreview
import com.fieldworker.domain.model.parseDateTime
import com.fieldworker.domain.model.parseDateTimeNonNull
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

private val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME
private fun LocalDateTime.toIso(): String = format(ISO)

private val gson = Gson()
private val attachmentsListType = object : TypeToken<List<ChatAttachment>>() {}.type
private val reactionsListType = object : TypeToken<List<ChatReaction>>() {}.type

// ============================================================================
// Conversation
// ============================================================================

fun Conversation.toEntity(): ConversationEntity = ConversationEntity(
    id = id,
    type = type.value,
    name = name,
    displayName = displayName,
    avatarUrl = avatarUrl,
    taskId = taskId,
    unreadCount = unreadCount,
    isMuted = isMuted,
    isArchived = isArchived,
    lastMessageId = lastMessage?.id,
    lastMessageText = lastMessage?.text,
    lastMessageSenderName = lastMessage?.senderName,
    lastMessageCreatedAt = lastMessage?.createdAt?.toIso(),
    createdAt = createdAt.toIso(),
    updatedAt = updatedAt?.toIso(),
)

fun ConversationEntity.toDomain(): Conversation = Conversation(
    id = id,
    type = ConversationType.fromString(type),
    name = name,
    displayName = displayName,
    avatarUrl = avatarUrl,
    taskId = taskId,
    unreadCount = unreadCount,
    isMuted = isMuted,
    isArchived = isArchived,
    lastMessage = lastMessageId?.let { lastId ->
        val createdAt = parseDateTime(lastMessageCreatedAt) ?: return@let null
        LastMessagePreview(
            id = lastId,
            text = lastMessageText,
            senderName = lastMessageSenderName,
            createdAt = createdAt,
        )
    },
    createdAt = parseDateTimeNonNull(createdAt),
    updatedAt = parseDateTime(updatedAt),
)

// ============================================================================
// Message
// ============================================================================

fun ChatMessage.toEntity(): MessageEntity = MessageEntity(
    id = id,
    conversationId = conversationId,
    senderId = senderId,
    senderName = senderName,
    text = text,
    messageType = messageType.value,
    isEdited = isEdited,
    isDeleted = isDeleted,
    replyToId = replyTo?.id,
    replyToText = replyTo?.text,
    replyToSenderName = replyTo?.senderName,
    attachmentsJson = gson.toJson(attachments),
    reactionsJson = gson.toJson(reactions),
    createdAt = createdAt.toIso(),
    editedAt = editedAt?.toIso(),
)

fun MessageEntity.toDomain(): ChatMessage = ChatMessage(
    id = id,
    conversationId = conversationId,
    senderId = senderId,
    senderName = senderName,
    text = text,
    messageType = MessageType.fromString(messageType),
    isEdited = isEdited,
    isDeleted = isDeleted,
    replyTo = replyToId?.let {
        ReplyPreview(id = it, text = replyToText, senderName = replyToSenderName)
    },
    attachments = runCatching {
        gson.fromJson<List<ChatAttachment>>(attachmentsJson, attachmentsListType) ?: emptyList()
    }.getOrDefault(emptyList()),
    reactions = runCatching {
        gson.fromJson<List<ChatReaction>>(reactionsJson, reactionsListType) ?: emptyList()
    }.getOrDefault(emptyList()),
    createdAt = parseDateTimeNonNull(createdAt),
    editedAt = parseDateTime(editedAt),
)
