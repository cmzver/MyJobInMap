package com.fieldworker.next.data.remote.api

import com.fieldworker.next.data.remote.model.PortalConversationListItemDto
import com.fieldworker.next.data.remote.model.PortalMessageDto
import com.fieldworker.next.data.remote.model.PortalMessageListDto

interface PortalChatApi {
    suspend fun getConversations(accessToken: String): List<PortalConversationListItemDto>
    suspend fun getMessages(accessToken: String, conversationId: Long, beforeId: Long?, limit: Int): PortalMessageListDto
    suspend fun sendMessage(accessToken: String, conversationId: Long, text: String, replyToId: Long?): PortalMessageDto
    suspend fun markRead(accessToken: String, conversationId: Long, lastMessageId: Long)
    suspend fun toggleReaction(accessToken: String, messageId: Long, emoji: String)
}
