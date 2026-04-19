package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.repository.ChatRepository

class MarkReadUseCase(
    private val repository: ChatRepository,
) {
    suspend operator fun invoke(conversationId: Long, lastMessageId: Long) =
        repository.markRead(conversationId, lastMessageId)
}
