package com.fieldworker.data.repository

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.fieldworker.data.api.ChatApi
import com.fieldworker.data.dto.*
import com.fieldworker.data.mapper.toDomain
import com.fieldworker.data.mapper.toDomainMembers
import com.fieldworker.data.realtime.ChatRealtimeClient
import com.fieldworker.data.realtime.ChatRealtimeEvent
import com.fieldworker.domain.model.*
import kotlinx.coroutines.flow.SharedFlow
import java.io.File
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import android.provider.OpenableColumns
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepository @Inject constructor(
    private val chatApi: ChatApi,
    private val chatRealtimeClient: ChatRealtimeClient,
    @ApplicationContext private val context: Context,
) {
    data class DownloadedAttachment(
        val uri: Uri,
        val mimeType: String,
        val fileName: String,
    )

    val realtimeEvents: SharedFlow<ChatRealtimeEvent> = chatRealtimeClient.events

    // ---- Conversations ----

    fun connectRealtime() {
        chatRealtimeClient.connect()
    }

    fun disconnectRealtime() {
        chatRealtimeClient.disconnect()
    }

    fun sendTypingIndicator(conversationId: Long, isTyping: Boolean) {
        chatRealtimeClient.sendTypingIndicator(conversationId, isTyping)
    }

    suspend fun getConversations(includeArchived: Boolean = false): Result<List<Conversation>> = apiCall {
        chatApi.getConversations(includeArchived = includeArchived)
    }.map { list -> list.map { it.toDomain() } }

    suspend fun getConversationDetail(conversationId: Long): Result<ConversationDetail> = apiCall {
        chatApi.getConversationDetail(conversationId)
    }.map { it.toDomain() }

    suspend fun updateConversationName(
        conversationId: Long,
        name: String,
    ): Result<Unit> = apiCall {
        chatApi.updateConversation(conversationId, ConversationUpdateDto(name = name))
    }.map { }

    suspend fun createConversation(
        type: ConversationType,
        name: String?,
        taskId: Long?,
        memberUserIds: List<Long>,
    ): Result<Long> = apiCall {
        chatApi.createConversation(
            ConversationCreateDto(
                type = type.value,
                name = name,
                taskId = taskId,
                memberUserIds = memberUserIds,
            )
        )
    }.map { it.id }

    suspend fun getTaskConversation(taskId: Long): Result<Long> = apiCall {
        chatApi.getTaskConversation(taskId)
    }.map { it.id }

    suspend fun muteConversation(conversationId: Long, isMuted: Boolean): Result<Unit> = apiCall {
        chatApi.muteConversation(conversationId, MuteRequestDto(isMuted = isMuted))
    }

    suspend fun archiveConversation(conversationId: Long, isArchived: Boolean): Result<Unit> = apiCall {
        chatApi.archiveConversation(conversationId, ArchiveRequestDto(isArchived = isArchived))
    }

    suspend fun addMembers(conversationId: Long, userIds: List<Long>): Result<List<ConversationMember>> = apiCall {
        chatApi.addMembers(conversationId, MemberAddRequestDto(userIds = userIds))
    }.map { it.toDomainMembers() }

    suspend fun removeMember(conversationId: Long, userId: Long): Result<Unit> = apiCall {
        chatApi.removeMember(conversationId, userId)
    }

    suspend fun updateMemberRole(
        conversationId: Long,
        userId: Long,
        role: String,
    ): Result<List<ConversationMember>> = apiCall {
        chatApi.updateMemberRole(conversationId, userId, MemberRoleUpdateRequestDto(role = role))
    }.map { it.toDomainMembers() }

    suspend fun transferOwnership(
        conversationId: Long,
        userId: Long,
    ): Result<List<ConversationMember>> = apiCall {
        chatApi.transferOwnership(conversationId, OwnershipTransferRequestDto(userId = userId))
    }.map { it.toDomainMembers() }

    // ---- Messages ----

    suspend fun getMessages(
        conversationId: Long,
        beforeId: Long? = null,
        limit: Int = 30,
    ): Result<Pair<List<ChatMessage>, Boolean>> = apiCall {
        chatApi.getMessages(conversationId, beforeId, limit)
    }.map { dto -> dto.items.map { it.toDomain() } to dto.hasMore }

    suspend fun sendMessage(
        conversationId: Long,
        text: String?,
        replyToId: Long? = null,
        messageType: String = "text",
    ): Result<ChatMessage> = apiCall {
        chatApi.sendMessage(conversationId, MessageCreateDto(text = text, replyToId = replyToId, messageType = messageType))
    }.map { it.toDomain() }

    suspend fun sendAttachment(
        conversationId: Long,
        fileUri: Uri,
    ): Result<ChatMessage> = runCatching {
        val attachmentData = readAttachment(fileUri)
        val messageType = if (attachmentData.mimeType.startsWith("image/")) "image" else "file"

        val message = sendMessage(
            conversationId = conversationId,
            text = null,
            messageType = messageType,
        ).getOrElse { throw it }

        val requestBody = attachmentData.bytes.toRequestBody(attachmentData.mimeType.toMediaTypeOrNull())
        val filePart = MultipartBody.Part.createFormData("file", attachmentData.fileName, requestBody)
        apiCall { chatApi.uploadAttachment(message.id, filePart) }
            .map { it.toDomain() }
            .getOrElse { throw it }
    }.fold(
        onSuccess = { Result.success(it) },
        onFailure = { Result.failure(it) },
    )

    suspend fun downloadAttachment(attachment: ChatAttachment): Result<DownloadedAttachment> = runCatching {
        val response = chatApi.downloadAttachment(attachment.id)
        if (!response.isSuccessful) {
            throw IllegalStateException("HTTP ${response.code()}: ${response.message()}")
        }

        val body = response.body() ?: throw IllegalStateException("Пустой ответ сервера")
        val fileName = attachment.fileName.ifBlank { "attachment_${attachment.id}" }
        val attachmentsDir = File(context.cacheDir, "chat_attachments").apply { mkdirs() }
        val targetFile = File(attachmentsDir, fileName)

        body.byteStream().use { input ->
            targetFile.outputStream().use { output ->
                input.copyTo(output)
            }
        }

        DownloadedAttachment(
            uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                targetFile,
            ),
            mimeType = attachment.mimeType,
            fileName = fileName,
        )
    }.fold(
        onSuccess = { Result.success(it) },
        onFailure = { Result.failure(it) },
    )

    suspend fun editMessage(messageId: Long, text: String): Result<ChatMessage> = apiCall {
        chatApi.editMessage(messageId, MessageUpdateDto(text = text))
    }.map { it.toDomain() }

    suspend fun deleteMessage(messageId: Long): Result<ChatMessage> = apiCall {
        chatApi.deleteMessage(messageId)
    }.map { it.toDomain() }

    // ---- Reactions ----

    suspend fun toggleReaction(messageId: Long, emoji: String): Result<List<ChatReaction>> = apiCall {
        chatApi.toggleReaction(messageId, ReactionCreateDto(emoji = emoji))
    }.map { list -> list.map { it.toDomain() } }

    // ---- Read receipts ----

    suspend fun markAsRead(conversationId: Long, lastMessageId: Long): Result<Unit> = apiCall {
        chatApi.markAsRead(conversationId, ReadReceiptDto(lastMessageId = lastMessageId))
    }

    // ---- Helper ----

    private suspend fun <T> apiCall(block: suspend () -> retrofit2.Response<T>): Result<T> {
        return try {
            val response = block()
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    Result.success(body)
                } else {
                    @Suppress("UNCHECKED_CAST")
                    Result.success(Unit as T)
                }
            } else {
                Result.failure(Exception("HTTP ${response.code()}: ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun readAttachment(fileUri: Uri): AttachmentUploadData {
        val resolver = context.contentResolver
        val mimeType = resolver.getType(fileUri) ?: "application/octet-stream"
        val fileName = resolver.query(fileUri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
            }
            ?: "attachment_${System.currentTimeMillis()}"

        val bytes = resolver.openInputStream(fileUri)?.use { input ->
            input.readBytes()
        } ?: throw IllegalStateException("Не удалось открыть файл")

        return AttachmentUploadData(
            fileName = fileName,
            mimeType = mimeType,
            bytes = bytes,
        )
    }

    private data class AttachmentUploadData(
        val fileName: String,
        val mimeType: String,
        val bytes: ByteArray,
    )
}
