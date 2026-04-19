package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.UserSession
import com.fieldworker.next.domain.repository.SessionRepository
import kotlinx.coroutines.flow.Flow

class ObserveSessionUseCase(
    private val repository: SessionRepository,
) {
    operator fun invoke(): Flow<UserSession> = repository.observeSession()
}
