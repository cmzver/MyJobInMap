package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.Conversation
import com.fieldworker.next.domain.repository.ChatRepository
import kotlinx.coroutines.flow.Flow

class ObserveConversationsUseCase(
    private val repository: ChatRepository,
) {
    operator fun invoke(): Flow<List<Conversation>> = repository.observeConversations()
}
