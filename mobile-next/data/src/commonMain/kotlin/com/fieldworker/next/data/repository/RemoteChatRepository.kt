package com.fieldworker.next.data.repository

import com.fieldworker.next.data.remote.api.PortalChatApi
import com.fieldworker.next.data.remote.mapper.toChatMessage
import com.fieldworker.next.data.remote.mapper.toConversation
import com.fieldworker.next.data.remote.store.PortalSessionStore
import com.fieldworker.next.domain.model.ChatMessage
import com.fieldworker.next.domain.model.ChatMessagePage
import com.fieldworker.next.domain.model.Conversation
import com.fieldworker.next.domain.repository.ChatRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

class RemoteChatRepository(
    private val chatApi: PortalChatApi,
    private val sessionStore: PortalSessionStore,
) : ChatRepository {

    private val conversations = MutableStateFlow<List<Conversation>>(emptyList())

    override fun observeConversations(): Flow<List<Conversation>> = conversations

    override suspend fun refreshConversations() {
        val token = sessionStore.read()?.accessToken ?: return
        val items = chatApi.getConversations(token).map { it.toConversation() }
        conversations.value = items
    }

    override suspend fun getMessages(
        conversationId: Long,
        beforeId: Long?,
        limit: Int,
    ): ChatMessagePage {
        val session = sessionStore.read() ?: throw IllegalStateException("Not authenticated")
        val dto = chatApi.getMessages(session.accessToken, conversationId, beforeId, limit)
        return ChatMessagePage(
            items = dto.items.map { it.toChatMessage(session.userId) },
            hasMore = dto.hasMore,
        )
    }

    override suspend fun sendMessage(
        conversationId: Long,
        text: String,
        replyToId: Long?,
    ): ChatMessage {
        val session = sessionStore.read() ?: throw IllegalStateException("Not authenticated")
        val dto = chatApi.sendMessage(session.accessToken, conversationId, text, replyToId)
        return dto.toChatMessage(session.userId)
    }

    override suspend fun markRead(conversationId: Long, lastMessageId: Long) {
        val token = sessionStore.read()?.accessToken ?: return
        chatApi.markRead(token, conversationId, lastMessageId)
    }

    override suspend fun toggleReaction(messageId: Long, emoji: String) {
        val token = sessionStore.read()?.accessToken ?: return
        chatApi.toggleReaction(token, messageId, emoji)
    }
}
