package com.fieldworker.data.repository

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.fieldworker.data.api.ChatApi
import com.fieldworker.data.dto.*
import com.fieldworker.data.image.ImageCompressor
import com.fieldworker.data.local.dao.ConversationDao
import com.fieldworker.data.local.dao.MessageDao
import com.fieldworker.data.mapper.toDomain
import com.fieldworker.data.mapper.toDomainMembers
import com.fieldworker.data.mapper.toEntity
import com.fieldworker.data.realtime.ChatRealtimeClient
import com.fieldworker.data.realtime.ChatRealtimeEvent
import com.fieldworker.domain.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.map
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
    private val imageCompressor: ImageCompressor,
    private val conversationDao: ConversationDao,
    private val messageDao: MessageDao,
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

    /**
     * Список бесед как реактивный поток из локального кэша. Подходит первичным
     * источником для UI: данные есть сразу при холодном старте, а сетевой
     * `getConversations()` лишь обновляет таблицу.
     */
    fun observeConversations(): Flow<List<Conversation>> =
        conversationDao.observeAll().map { entities -> entities.map { it.toDomain() } }

    suspend fun getConversations(includeArchived: Boolean = false): Result<List<Conversation>> {
        val networkResult = apiCall {
            chatApi.getConversations(includeArchived = includeArchived)
        }.map { list -> list.map { it.toDomain() } }

        return networkResult.fold(
            onSuccess = { conversations ->
                runCatching {
                    conversationDao.upsertAll(conversations.map { it.toEntity() })
                    // Когда запрашиваем includeArchived=true сервер возвращает все —
                    // только тогда безопасно удалять пропавшие записи.
                    if (includeArchived) {
                        conversationDao.deleteNotIn(conversations.map { it.id })
                    }
                }
                Result.success(conversations)
            },
            onFailure = { error ->
                val cached = runCatching { conversationDao.getAll().map { it.toDomain() } }
                    .getOrDefault(emptyList())
                if (cached.isNotEmpty()) {
                    Result.success(
                        if (includeArchived) cached else cached.filterNot { it.isArchived }
                    )
                } else {
                    Result.failure(error)
                }
            }
        )
    }

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
    ): Result<Pair<List<ChatMessage>, Boolean>> {
        val networkResult = apiCall {
            chatApi.getMessages(conversationId, beforeId, limit)
        }.map { dto -> dto.items.map { it.toDomain() } to dto.hasMore }

        return networkResult.fold(
            onSuccess = { (messages, hasMore) ->
                runCatching {
                    if (messages.isNotEmpty()) {
                        messageDao.upsertAll(messages.map { it.toEntity() })
                    }
                    // Бережём место: храним до MAX_CACHED_PER_CONVERSATION последних
                    // сообщений на беседу.
                    messageDao.trimToLast(conversationId, MAX_CACHED_PER_CONVERSATION)
                }
                Result.success(messages to hasMore)
            },
            onFailure = { error ->
                val cached = runCatching {
                    if (beforeId == null) {
                        messageDao.getLatest(conversationId, limit)
                    } else {
                        messageDao.getBefore(conversationId, beforeId, limit)
                    }
                }.getOrDefault(emptyList()).map { it.toDomain() }

                if (cached.isNotEmpty()) {
                    // hasMore из кэша честно не определить — выставляем true, чтобы
                    // UI попытался догрузить при появлении сети.
                    Result.success(cached to true)
                } else {
                    Result.failure(error)
                }
            }
        )
    }

    suspend fun sendMessage(
        conversationId: Long,
        text: String?,
        replyToId: Long? = null,
        messageType: String = "text",
        taskId: Long? = null,
    ): Result<ChatMessage> = apiCall {
        chatApi.sendMessage(
            conversationId,
            MessageCreateDto(
                text = text,
                replyToId = replyToId,
                messageType = messageType,
                taskId = taskId,
            ),
        )
    }.map { it.toDomain() }
        .onSuccess { cacheMessage(it) }

    suspend fun sendAttachment(
        conversationId: Long,
        fileUri: Uri,
        text: String? = null,
        replyToId: Long? = null,
    ): Result<ChatMessage> = runCatching {
        val rawAttachment = readAttachment(fileUri)
        val isImage = rawAttachment.mimeType.startsWith("image/")
        val messageType = if (isImage) "image" else "file"

        // Изображения сжимаем (1920px / JPEG q85), остальные файлы шлём как есть.
        val attachmentData = if (isImage) {
            imageCompressor.compress(fileUri, fileNamePrefix = "image")?.let { c ->
                AttachmentUploadData(fileName = c.fileName, mimeType = c.mimeType, bytes = c.bytes)
            } ?: rawAttachment
        } else {
            rawAttachment
        }

        val message = sendMessage(
            conversationId = conversationId,
            text = text?.takeIf { it.isNotBlank() },
            replyToId = replyToId,
            messageType = messageType,
        ).getOrElse { throw it }

        val requestBody = attachmentData.bytes.toRequestBody(attachmentData.mimeType.toMediaTypeOrNull())
        val filePart = MultipartBody.Part.createFormData("file", attachmentData.fileName, requestBody)
        apiCall { chatApi.uploadAttachment(message.id, filePart) }
            .map { it.toDomain() }
            .onSuccess { cacheMessage(it) }
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
        .onSuccess { cacheMessage(it) }

    suspend fun deleteMessage(messageId: Long): Result<ChatMessage> = apiCall {
        chatApi.deleteMessage(messageId)
    }.map { it.toDomain() }
        .onSuccess { cacheMessage(it) /* сервер отдаёт сообщение с isDeleted=true */ }

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

    /**
     * Реактивный поток сообщений беседы из локального кэша.
     */
    fun observeMessages(conversationId: Long): Flow<List<ChatMessage>> =
        messageDao.observeForConversation(conversationId).map { entities ->
            entities.map { it.toDomain() }
        }

    /**
     * Сохранить одно сообщение в кэш — например, после успешной отправки или
     * прихода realtime-события.
     */
    suspend fun cacheMessage(message: ChatMessage) {
        runCatching { messageDao.upsert(message.toEntity()) }
    }

    /**
     * Удалить сообщение из кэша (когда сервер прислал hard-delete).
     */
    suspend fun removeCachedMessage(messageId: Long) {
        runCatching { messageDao.deleteById(messageId) }
    }

    /**
     * Очистить весь кэш чатов (например, при logout).
     */
    suspend fun clearChatCache() {
        runCatching {
            // Без FK-каскада нужно вручную очистить обе таблицы.
            conversationDao.getAll().forEach { messageDao.deleteByConversation(it.id) }
            conversationDao.deleteAll()
        }
    }

    companion object {
        private const val MAX_CACHED_PER_CONVERSATION = 200
    }
}
