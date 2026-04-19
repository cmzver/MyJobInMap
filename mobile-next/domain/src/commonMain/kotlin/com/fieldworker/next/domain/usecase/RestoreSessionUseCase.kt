package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.UserSession
import com.fieldworker.next.domain.repository.SessionRepository

class RestoreSessionUseCase(
    private val repository: SessionRepository,
) {
    suspend operator fun invoke(): AppResult<UserSession> = repository.restoreSession()
}
