package com.fieldworker.next.data.repository

import com.fieldworker.next.data.remote.BaseUrlProvider
import com.fieldworker.next.data.remote.PortalApiException
import com.fieldworker.next.data.remote.api.PortalAuthApi
import com.fieldworker.next.data.remote.mapper.toUserSession
import com.fieldworker.next.data.remote.model.PortalRefreshRequest
import com.fieldworker.next.data.remote.store.PortalSessionStore
import com.fieldworker.next.data.remote.store.toStoredSession
import com.fieldworker.next.data.remote.store.withToken
import com.fieldworker.next.data.remote.toAppError
import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.Credentials
import com.fieldworker.next.domain.model.ServerEnvironment
import com.fieldworker.next.domain.model.UserSession
import com.fieldworker.next.domain.repository.SessionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

class RemoteSessionRepository(
    private val authApi: PortalAuthApi,
    private val sessionStore: PortalSessionStore,
    private val environments: List<ServerEnvironment>,
    private val baseUrlProvider: BaseUrlProvider,
) : SessionRepository {
    private val session = MutableStateFlow(UserSession.Guest)

    override fun observeSession(): Flow<UserSession> = session

    override fun getAvailableEnvironments(): List<ServerEnvironment> = environments

    override suspend fun signIn(
        credentials: Credentials,
        environmentId: String,
    ): AppResult<UserSession> {
        val environment = environments.firstOrNull { it.id == environmentId }
            ?: return AppResult.Failure(AppError.Validation("Unknown environment"))

        return try {
            baseUrlProvider.activeEnvironmentId = environmentId
            val token = authApi.login(
                username = credentials.username,
                password = credentials.password,
            )
            sessionStore.write(token.toStoredSession(environmentId))

            val newSession = token.toUserSession(environment)
            session.value = newSession

            AppResult.Success(newSession)
        } catch (error: Throwable) {
            AppResult.Failure(error.toAppError())
        }
    }

    override suspend fun restoreSession(): AppResult<UserSession> {
        val storedSession = sessionStore.read()
            ?: run {
                session.value = UserSession.Guest
                return AppResult.Success(UserSession.Guest)
            }

        val environment = environments.firstOrNull { it.id == storedSession.environmentId }
            ?: run {
                sessionStore.clear()
                session.value = UserSession.Guest
                return AppResult.Failure(
                    AppError.Validation("Stored environment is no longer available")
                )
            }

        return try {
            baseUrlProvider.activeEnvironmentId = storedSession.environmentId
            val restoredUser = try {
                authApi.getCurrentUser(storedSession.accessToken)
            } catch (error: Throwable) {
                if (error is PortalApiException && error.statusCode == 401) {
                    val refreshedToken = authApi.refresh(
                        PortalRefreshRequest(refreshToken = storedSession.refreshToken)
                    )
                    sessionStore.write(storedSession.withToken(refreshedToken))
                    authApi.getCurrentUser(refreshedToken.accessToken)
                } else {
                    throw error
                }
            }

            val restoredSession = restoredUser.toUserSession(environment)
            session.value = restoredSession

            AppResult.Success(restoredSession)
        } catch (error: Throwable) {
            if (error is PortalApiException && error.statusCode == 401) {
                sessionStore.clear()
                session.value = UserSession.Guest
                AppResult.Failure(AppError.Unauthorized)
            } else {
                AppResult.Failure(error.toAppError())
            }
        }
    }

    override suspend fun signOut() {
        sessionStore.clear()
        session.value = UserSession.Guest
    }
}
