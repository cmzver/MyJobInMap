package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.repository.SessionRepository

class SignOutUseCase(
    private val repository: SessionRepository,
) {
    suspend operator fun invoke() {
        repository.signOut()
    }
}
