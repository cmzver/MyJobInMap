package com.fieldworker.next.data.repository

import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.Credentials
import com.fieldworker.next.domain.model.ServerEnvironment
import com.fieldworker.next.domain.model.UserRole
import com.fieldworker.next.domain.model.UserSession
import com.fieldworker.next.domain.repository.SessionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

class InMemorySessionRepository : SessionRepository {
    private val environments = listOf(
        ServerEnvironment(
            id = "prod",
            label = "Production",
            baseUrl = "https://portal.example.com",
            isDefault = true,
        ),
        ServerEnvironment(
            id = "staging",
            label = "Staging",
            baseUrl = "https://staging.example.com",
        ),
    )

    private val session = MutableStateFlow(UserSession.Guest)

    override fun observeSession(): Flow<UserSession> = session

    override fun getAvailableEnvironments(): List<ServerEnvironment> = environments

    override suspend fun restoreSession(): AppResult<UserSession> {
        return AppResult.Success(session.value)
    }

    override suspend fun signIn(
        credentials: Credentials,
        environmentId: String,
    ): AppResult<UserSession> {
        val environment = environments.firstOrNull { it.id == environmentId }
            ?: return AppResult.Failure(AppError.Validation("Unknown environment"))

        if (credentials.password.length < 4) {
            return AppResult.Failure(AppError.Validation("Password is too short"))
        }

        if (credentials.username.equals("blocked", ignoreCase = true)) {
            return AppResult.Failure(AppError.Unauthorized)
        }

        val newSession = UserSession(
            userId = 42L,
            fullName = "Vadim Petrov",
            role = UserRole.WORKER,
            organizationName = "Field Operations",
            environment = environment,
            isAuthenticated = true,
        )
        session.value = newSession

        return AppResult.Success(newSession)
    }

    override suspend fun signOut() {
        session.value = UserSession.Guest
    }
}
