package com.fieldworker.next.domain.repository

import com.fieldworker.next.domain.model.ChatMessage
import com.fieldworker.next.domain.model.ChatMessagePage
import com.fieldworker.next.domain.model.Conversation
import kotlinx.coroutines.flow.Flow

interface ChatRepository {
    fun observeConversations(): Flow<List<Conversation>>
    suspend fun refreshConversations()
    suspend fun getMessages(conversationId: Long, beforeId: Long? = null, limit: Int = 50): ChatMessagePage
    suspend fun sendMessage(conversationId: Long, text: String, replyToId: Long? = null): ChatMessage
    suspend fun markRead(conversationId: Long, lastMessageId: Long)
    suspend fun toggleReaction(messageId: Long, emoji: String)
}
