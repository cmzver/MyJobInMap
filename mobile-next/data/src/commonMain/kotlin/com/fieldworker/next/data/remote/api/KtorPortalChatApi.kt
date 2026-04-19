package com.fieldworker.next.data.remote.api

import com.fieldworker.next.data.remote.BaseUrlProvider
import com.fieldworker.next.data.remote.PortalApiException
import com.fieldworker.next.data.remote.model.PortalConversationListItemDto
import com.fieldworker.next.data.remote.model.PortalMessageDto
import com.fieldworker.next.data.remote.model.PortalMessageListDto
import com.fieldworker.next.data.remote.model.PortalReactionRequest
import com.fieldworker.next.data.remote.model.PortalReadReceiptRequest
import com.fieldworker.next.data.remote.model.PortalSendMessageRequest
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType

class KtorPortalChatApi(
    private val client: HttpClient,
    private val baseUrlProvider: BaseUrlProvider,
) : PortalChatApi {

    override suspend fun getConversations(accessToken: String): List<PortalConversationListItemDto> {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.get("$baseUrl/api/chat/conversations") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
        }
        if (response.status.value != 200) {
            throw PortalApiException(response.status.value, "Failed to get conversations")
        }
        return response.body()
    }

    override suspend fun getMessages(
        accessToken: String,
        conversationId: Long,
        beforeId: Long?,
        limit: Int,
    ): PortalMessageListDto {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.get("$baseUrl/api/chat/conversations/$conversationId/messages") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            beforeId?.let { parameter("before_id", it) }
            parameter("limit", limit)
        }
        if (response.status.value != 200) {
            throw PortalApiException(response.status.value, "Failed to get messages")
        }
        return response.body()
    }

    override suspend fun sendMessage(
        accessToken: String,
        conversationId: Long,
        text: String,
        replyToId: Long?,
    ): PortalMessageDto {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.post("$baseUrl/api/chat/conversations/$conversationId/messages") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            contentType(ContentType.Application.Json)
            setBody(PortalSendMessageRequest(text = text, replyToId = replyToId))
        }
        if (response.status.value != 200) {
            throw PortalApiException(response.status.value, "Failed to send message")
        }
        return response.body()
    }

    override suspend fun markRead(accessToken: String, conversationId: Long, lastMessageId: Long) {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.post("$baseUrl/api/chat/conversations/$conversationId/read") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            contentType(ContentType.Application.Json)
            setBody(PortalReadReceiptRequest(lastMessageId = lastMessageId))
        }
        if (response.status.value != 200) {
            throw PortalApiException(response.status.value, "Failed to mark read")
        }
    }

    override suspend fun toggleReaction(accessToken: String, messageId: Long, emoji: String) {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.post("$baseUrl/api/chat/messages/$messageId/reactions") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            contentType(ContentType.Application.Json)
            setBody(PortalReactionRequest(emoji = emoji))
        }
        if (response.status.value != 200) {
            throw PortalApiException(response.status.value, "Failed to toggle reaction")
        }
    }
}
