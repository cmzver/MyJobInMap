package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.Credentials
import com.fieldworker.next.domain.model.ServerEnvironment
import com.fieldworker.next.domain.model.UserRole
import com.fieldworker.next.domain.model.UserSession
import com.fieldworker.next.domain.repository.SessionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class SignInUseCaseTest {
    @Test
    fun rejectsBlankUsernameBeforeRepositoryCall() = runBlocking {
        val useCase = SignInUseCase(FakeSessionRepository())

        val result = useCase(
            credentials = Credentials(username = " ", password = "1234"),
            environmentId = "prod",
        )

        val error = assertIs<AppResult.Failure>(result).error
        assertEquals(
            AppError.Validation(message = "Username is required"),
            error,
        )
    }

    @Test
    fun trimsCredentialsAndReturnsSession() = runBlocking {
        val useCase = SignInUseCase(FakeSessionRepository())

        val result = useCase(
            credentials = Credentials(username = " worker ", password = "1234"),
            environmentId = "prod",
        )

        val session = assertIs<AppResult.Success<UserSession>>(result).value
        assertEquals("Worker User", session.fullName)
        assertEquals(UserRole.WORKER, session.role)
    }

    private class FakeSessionRepository : SessionRepository {
        override fun observeSession(): Flow<UserSession> = flowOf(UserSession.Guest)

        override fun getAvailableEnvironments(): List<ServerEnvironment> = emptyList()

        override suspend fun signIn(
            credentials: Credentials,
            environmentId: String,
        ): AppResult<UserSession> {
            return AppResult.Success(
                UserSession(
                    userId = 7L,
                    fullName = "Worker User",
                    role = UserRole.WORKER,
                    organizationName = "Ops",
                    environment = ServerEnvironment(
                        id = environmentId,
                        label = "Production",
                        baseUrl = "https://portal.example.com",
                    ),
                    isAuthenticated = true,
                )
            )
        }

        override suspend fun signOut() = Unit
    }
}
