package com.fieldworker.next.data.remote.api

import com.fieldworker.next.data.remote.BaseUrlProvider
import com.fieldworker.next.data.remote.PortalApiException
import com.fieldworker.next.data.remote.createPortalHttpClient
import com.fieldworker.next.data.remote.model.PortalRefreshRequest
import com.fieldworker.next.domain.model.ServerEnvironment
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull

class KtorPortalAuthApiTest {

    private val jsonHeaders = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())

    @Test
    fun `login returns token on 200`() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("/api/auth/login", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            respond(
                content = LOGIN_RESPONSE_JSON,
                status = HttpStatusCode.OK,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalAuthApi(createPortalHttpClient(engine), baseUrlProvider())

        val token = api.login("admin", "admin")

        assertEquals("test-access-token", token.accessToken)
        assertEquals("test-refresh-token", token.refreshToken)
        assertEquals("bearer", token.tokenType)
        assertEquals(42L, token.userId)
        assertEquals("admin", token.username)
        assertEquals("admin", token.role)
        assertEquals("Admin User", token.fullName)
    }

    @Test
    fun `login throws PortalApiException on 401`() = runBlocking {
        val engine = MockEngine {
            respond(
                content = """{"detail":"Invalid credentials"}""",
                status = HttpStatusCode.Unauthorized,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalAuthApi(createPortalHttpClient(engine), baseUrlProvider())

        val error = assertFailsWith<PortalApiException> {
            api.login("wrong", "wrong")
        }
        assertEquals(401, error.statusCode)
    }

    @Test
    fun `refresh returns new token on 200`() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("/api/auth/refresh", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            respond(
                content = LOGIN_RESPONSE_JSON,
                status = HttpStatusCode.OK,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalAuthApi(createPortalHttpClient(engine), baseUrlProvider())

        val token = api.refresh(PortalRefreshRequest("old-refresh"))
        assertNotNull(token)
        assertEquals("test-access-token", token.accessToken)
    }

    @Test
    fun `getCurrentUser returns user on 200`() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("/api/auth/me", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer my-token", request.headers[HttpHeaders.Authorization])
            respond(
                content = USER_RESPONSE_JSON,
                status = HttpStatusCode.OK,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalAuthApi(createPortalHttpClient(engine), baseUrlProvider())

        val user = api.getCurrentUser("my-token")

        assertEquals(42L, user.id)
        assertEquals("admin", user.username)
        assertEquals("Admin User", user.fullName)
        assertEquals("admin", user.role)
        assertEquals(true, user.isActive)
    }

    @Test
    fun `getCurrentUser throws on 401`() = runBlocking {
        val engine = MockEngine {
            respond(
                content = """{"detail":"Not authenticated"}""",
                status = HttpStatusCode.Unauthorized,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalAuthApi(createPortalHttpClient(engine), baseUrlProvider())

        val error = assertFailsWith<PortalApiException> {
            api.getCurrentUser("expired-token")
        }
        assertEquals(401, error.statusCode)
    }

    private companion object {
        const val BASE_URL = "http://localhost:8001"

        fun baseUrlProvider() = BaseUrlProvider(
            listOf(ServerEnvironment(id = "test", label = "Test", baseUrl = BASE_URL, isDefault = true))
        )

        val LOGIN_RESPONSE_JSON = """
            {
                "access_token": "test-access-token",
                "refresh_token": "test-refresh-token",
                "token_type": "bearer",
                "user_id": 42,
                "username": "admin",
                "role": "admin",
                "full_name": "Admin User",
                "avatar_url": null,
                "organization_id": 1,
                "organization_name": "Test Org"
            }
        """.trimIndent()

        val USER_RESPONSE_JSON = """
            {
                "id": 42,
                "username": "admin",
                "full_name": "Admin User",
                "email": "admin@example.com",
                "phone": null,
                "avatar_url": null,
                "role": "admin",
                "is_active": true,
                "created_at": "2026-01-01T00:00:00",
                "last_login": "2026-04-14T10:00:00",
                "assigned_tasks_count": 5,
                "organization_id": 1
            }
        """.trimIndent()
    }
}
