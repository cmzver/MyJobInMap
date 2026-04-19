package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.Credentials
import com.fieldworker.next.domain.model.UserSession
import com.fieldworker.next.domain.repository.SessionRepository

class SignInUseCase(
    private val repository: SessionRepository,
) {
    suspend operator fun invoke(
        credentials: Credentials,
        environmentId: String,
    ): AppResult<UserSession> {
        if (credentials.username.isBlank()) {
            return AppResult.Failure(AppError.Validation("Username is required"))
        }
        if (credentials.password.isBlank()) {
            return AppResult.Failure(AppError.Validation("Password is required"))
        }
        if (environmentId.isBlank()) {
            return AppResult.Failure(AppError.Validation("Environment is required"))
        }

        return repository.signIn(
            credentials = credentials.copy(
                username = credentials.username.trim(),
                password = credentials.password,
            ),
            environmentId = environmentId,
        )
    }
}
