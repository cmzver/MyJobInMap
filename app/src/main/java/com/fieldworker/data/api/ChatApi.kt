package com.fieldworker.data.api

import com.fieldworker.data.dto.*
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface ChatApi {

    // ---- Conversations ----

    @GET("/api/chat/conversations")
    suspend fun getConversations(
        @Query("include_archived") includeArchived: Boolean = false,
    ): Response<List<ConversationListItemDto>>

    @POST("/api/chat/conversations")
    suspend fun createConversation(
        @Body body: ConversationCreateDto,
    ): Response<ConversationResponseDto>

    @GET("/api/chat/conversations/{id}")
    suspend fun getConversationDetail(
        @Path("id") conversationId: Long,
    ): Response<ConversationDetailDto>

    @PATCH("/api/chat/conversations/{id}")
    suspend fun updateConversation(
        @Path("id") conversationId: Long,
        @Body body: ConversationUpdateDto,
    ): Response<ConversationResponseDto>

    @POST("/api/chat/conversations/{id}/members")
    suspend fun addMembers(
        @Path("id") conversationId: Long,
        @Body body: MemberAddRequestDto,
    ): Response<List<MemberInfoDto>>

    @DELETE("/api/chat/conversations/{id}/members/{userId}")
    suspend fun removeMember(
        @Path("id") conversationId: Long,
        @Path("userId") userId: Long,
    ): Response<Unit>

    @PATCH("/api/chat/conversations/{id}/members/{userId}")
    suspend fun updateMemberRole(
        @Path("id") conversationId: Long,
        @Path("userId") userId: Long,
        @Body body: MemberRoleUpdateRequestDto,
    ): Response<List<MemberInfoDto>>

    @POST("/api/chat/conversations/{id}/transfer-ownership")
    suspend fun transferOwnership(
        @Path("id") conversationId: Long,
        @Body body: OwnershipTransferRequestDto,
    ): Response<List<MemberInfoDto>>

    @GET("/api/chat/task/{taskId}")
    suspend fun getTaskConversation(
        @Path("taskId") taskId: Long,
    ): Response<ConversationResponseDto>

    @PATCH("/api/chat/conversations/{id}/mute")
    suspend fun muteConversation(
        @Path("id") conversationId: Long,
        @Body body: MuteRequestDto,
    ): Response<Unit>

    @PATCH("/api/chat/conversations/{id}/archive")
    suspend fun archiveConversation(
        @Path("id") conversationId: Long,
        @Body body: ArchiveRequestDto,
    ): Response<Unit>

    // ---- Messages ----

    @GET("/api/chat/conversations/{id}/messages")
    suspend fun getMessages(
        @Path("id") conversationId: Long,
        @Query("before_id") beforeId: Long? = null,
        @Query("limit") limit: Int = 30,
    ): Response<MessageListDto>

    @POST("/api/chat/conversations/{id}/messages")
    suspend fun sendMessage(
        @Path("id") conversationId: Long,
        @Body body: MessageCreateDto,
    ): Response<MessageDto>

    @Multipart
    @POST("/api/chat/messages/{id}/attachments")
    suspend fun uploadAttachment(
        @Path("id") messageId: Long,
        @Part file: MultipartBody.Part,
    ): Response<MessageDto>

    @Streaming
    @GET("/api/chat/attachments/{id}/download")
    suspend fun downloadAttachment(
        @Path("id") attachmentId: Long,
    ): Response<ResponseBody>

    @PATCH("/api/chat/messages/{id}")
    suspend fun editMessage(
        @Path("id") messageId: Long,
        @Body body: MessageUpdateDto,
    ): Response<MessageDto>

    @DELETE("/api/chat/messages/{id}")
    suspend fun deleteMessage(
        @Path("id") messageId: Long,
    ): Response<MessageDto>

    // ---- Reactions ----

    @POST("/api/chat/messages/{id}/reactions")
    suspend fun toggleReaction(
        @Path("id") messageId: Long,
        @Body body: ReactionCreateDto,
    ): Response<MessageDto>

    // ---- Read receipts ----

    @POST("/api/chat/conversations/{id}/read")
    suspend fun markAsRead(
        @Path("id") conversationId: Long,
        @Body body: ReadReceiptDto,
    ): Response<Unit>
}
