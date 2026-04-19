package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.ChatMessagePage
import com.fieldworker.next.domain.repository.ChatRepository

class GetMessagesUseCase(
    private val repository: ChatRepository,
) {
    suspend operator fun invoke(
        conversationId: Long,
        beforeId: Long? = null,
        limit: Int = 50,
    ): ChatMessagePage = repository.getMessages(conversationId, beforeId, limit)
}
