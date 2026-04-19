package com.fieldworker.next.data.repository

import com.fieldworker.next.data.remote.BaseUrlProvider
import com.fieldworker.next.data.remote.PortalApiException
import com.fieldworker.next.data.remote.api.PortalAuthApi
import com.fieldworker.next.data.remote.model.PortalRefreshRequest
import com.fieldworker.next.data.remote.model.PortalTokenDto
import com.fieldworker.next.data.remote.model.PortalUserDto
import com.fieldworker.next.data.remote.store.PortalSessionStore
import com.fieldworker.next.data.remote.store.StoredPortalSession
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.Credentials
import com.fieldworker.next.domain.model.ServerEnvironment
import com.fieldworker.next.domain.model.UserRole
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RemoteSessionRepositoryTest {
    private val environments = listOf(
        ServerEnvironment(
            id = "prod",
            label = "Production",
            baseUrl = "https://portal.example.com",
            isDefault = true,
        )
    )

    @Test
    fun `sign in stores tokens and exposes authenticated session`() = runBlocking {
        val authApi = FakePortalAuthApi()
        val store = InMemoryPortalSessionStore()
        val repository = RemoteSessionRepository(
            authApi = authApi,
            sessionStore = store,
            environments = environments,
            baseUrlProvider = BaseUrlProvider(environments),
        )

        val result = repository.signIn(
            credentials = Credentials(username = "vadim", password = "secret"),
            environmentId = "prod",
        )

        val session = (result as AppResult.Success).value
        assertTrue(session.isAuthenticated)
        assertEquals(UserRole.WORKER, session.role)
        assertEquals("prod", store.session?.environmentId)
        assertEquals("access-token", store.session?.accessToken)
        assertEquals(session, repository.observeSession().first())
    }

    @Test
    fun `restore session refreshes access token after unauthorized me call`() = runBlocking {
        val authApi = FakePortalAuthApi().apply {
            meHandler = { accessToken ->
                if (accessToken == "expired-access") {
                    throw PortalApiException(statusCode = 401, message = "expired")
                }
                defaultUser(role = "dispatcher", fullName = "Dispatch Lead")
            }
            refreshHandler = {
                defaultToken(
                    accessToken = "fresh-access",
                    refreshToken = "fresh-refresh",
                )
            }
        }
        val store = InMemoryPortalSessionStore().apply {
            session = StoredPortalSession(
                environmentId = "prod",
                accessToken = "expired-access",
                refreshToken = "refresh-token",
                tokenType = "Bearer",
                userId = 7,
                username = "vadim",
            )
        }
        val repository = RemoteSessionRepository(
            authApi = authApi,
            sessionStore = store,
            environments = environments,
            baseUrlProvider = BaseUrlProvider(environments),
        )

        val result = repository.restoreSession()

        val session = (result as AppResult.Success).value
        assertEquals("fresh-access", store.session?.accessToken)
        assertEquals("fresh-refresh", store.session?.refreshToken)
        assertEquals(UserRole.DISPATCHER, session.role)
        assertEquals(1, authApi.refreshCalls)
        assertEquals(2, authApi.meCalls)
    }

    @Test
    fun `sign out clears persisted session`() = runBlocking {
        val authApi = FakePortalAuthApi()
        val store = InMemoryPortalSessionStore().apply {
            session = StoredPortalSession(
                environmentId = "prod",
                accessToken = "access-token",
                refreshToken = "refresh-token",
                tokenType = "Bearer",
                userId = 7,
                username = "vadim",
            )
        }
        val repository = RemoteSessionRepository(
            authApi = authApi,
            sessionStore = store,
            environments = environments,
            baseUrlProvider = BaseUrlProvider(environments),
        )

        repository.signOut()

        assertEquals(null, store.session)
        assertEquals(false, repository.observeSession().first().isAuthenticated)
    }

    private class FakePortalAuthApi : PortalAuthApi {
        var refreshCalls: Int = 0
        var meCalls: Int = 0
        var loginHandler: suspend (String, String) -> PortalTokenDto = { _, _ -> defaultToken() }
        var refreshHandler: suspend (PortalRefreshRequest) -> PortalTokenDto = { defaultToken() }
        var meHandler: suspend (String) -> PortalUserDto = { defaultUser() }

        override suspend fun login(
            username: String,
            password: String,
        ): PortalTokenDto {
            return loginHandler(username, password)
        }

        override suspend fun refresh(request: PortalRefreshRequest): PortalTokenDto {
            refreshCalls += 1
            return refreshHandler(request)
        }

        override suspend fun getCurrentUser(accessToken: String): PortalUserDto {
            meCalls += 1
            return meHandler(accessToken)
        }
    }

    private class InMemoryPortalSessionStore : PortalSessionStore {
        var session: StoredPortalSession? = null

        override suspend fun read(): StoredPortalSession? = session

        override suspend fun write(session: StoredPortalSession) {
            this.session = session
        }

        override suspend fun clear() {
            session = null
        }
    }

    private companion object {
        fun defaultToken(
            accessToken: String = "access-token",
            refreshToken: String = "refresh-token",
            role: String = "worker",
            fullName: String = "Vadim Petrov",
        ) = PortalTokenDto(
            accessToken = accessToken,
            refreshToken = refreshToken,
            tokenType = "Bearer",
            userId = 7,
            username = "vadim",
            role = role,
            fullName = fullName,
            organizationName = "Field Operations",
        )

        fun defaultUser(
            role: String = "worker",
            fullName: String = "Vadim Petrov",
        ) = PortalUserDto(
            id = 7,
            username = "vadim",
            fullName = fullName,
            role = role,
            isActive = true,
            createdAt = "2026-04-14T08:00:00",
        )
    }
}
