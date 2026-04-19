package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.ServerEnvironment
import com.fieldworker.next.domain.repository.SessionRepository

class GetAvailableEnvironmentsUseCase(
    private val repository: SessionRepository,
) {
    operator fun invoke(): List<ServerEnvironment> = repository.getAvailableEnvironments()
}
