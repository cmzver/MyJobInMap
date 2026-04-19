package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.ChatMessage
import com.fieldworker.next.domain.repository.ChatRepository

class SendMessageUseCase(
    private val repository: ChatRepository,
) {
    suspend operator fun invoke(
        conversationId: Long,
        text: String,
        replyToId: Long? = null,
    ): ChatMessage = repository.sendMessage(conversationId, text, replyToId)
}
