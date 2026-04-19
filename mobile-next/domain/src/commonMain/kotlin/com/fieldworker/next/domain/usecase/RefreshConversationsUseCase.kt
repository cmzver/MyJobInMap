package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.repository.ChatRepository

class RefreshConversationsUseCase(
    private val repository: ChatRepository,
) {
    suspend operator fun invoke() = repository.refreshConversations()
}
