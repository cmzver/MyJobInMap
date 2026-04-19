package com.fieldworker.next.data.remote.api

import com.fieldworker.next.data.remote.BaseUrlProvider
import com.fieldworker.next.data.remote.PortalApiException
import com.fieldworker.next.data.remote.createPortalHttpClient
import com.fieldworker.next.data.remote.model.PortalCreateCommentRequest
import com.fieldworker.next.data.remote.model.PortalStatusUpdateRequest
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

class KtorPortalTasksApiTest {

    private val jsonHeaders = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())

    @Test
    fun `getTasks returns paginated list`() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("/api/tasks", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer my-token", request.headers[HttpHeaders.Authorization])
            assertEquals("1", request.url.parameters["page"])
            assertEquals("20", request.url.parameters["size"])
            respond(
                content = TASKS_PAGE_JSON,
                status = HttpStatusCode.OK,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalTasksApi(createPortalHttpClient(engine), baseUrlProvider())

        val page = api.getTasks(accessToken = "my-token", page = 1, size = 20)

        assertEquals(2, page.items.size)
        assertEquals(2, page.total)
        assertEquals(1, page.page)
        assertEquals(20, page.size)

        val first = page.items[0]
        assertEquals(101L, first.id)
        assertEquals("FW-0001", first.taskNumber)
        assertEquals("Ремонт стояка", first.title)
        assertEquals("IN_PROGRESS", first.status)
        assertEquals("URGENT", first.priority)
    }

    @Test
    fun `getTasks throws on 401`() = runBlocking {
        val engine = MockEngine {
            respond(
                content = """{"detail":"Not authenticated"}""",
                status = HttpStatusCode.Unauthorized,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalTasksApi(createPortalHttpClient(engine), baseUrlProvider())

        val error = assertFailsWith<PortalApiException> {
            api.getTasks(accessToken = "bad-token")
        }
        assertEquals(401, error.statusCode)
    }

    @Test
    fun `getTaskDetail returns full task`() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("/api/tasks/101", request.url.encodedPath)
            respond(
                content = TASK_DETAIL_JSON,
                status = HttpStatusCode.OK,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalTasksApi(createPortalHttpClient(engine), baseUrlProvider())

        val detail = api.getTaskDetail(accessToken = "my-token", taskId = 101)

        assertEquals(101L, detail.id)
        assertEquals("Ремонт стояка", detail.title)
        assertEquals(1, detail.comments.size)
        assertEquals("Работа начата", detail.comments[0].text)
    }

    @Test
    fun `getTaskDetail throws on 404`() = runBlocking {
        val engine = MockEngine {
            respond(
                content = """{"detail":"Not found"}""",
                status = HttpStatusCode.NotFound,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalTasksApi(createPortalHttpClient(engine), baseUrlProvider())

        val error = assertFailsWith<PortalApiException> {
            api.getTaskDetail(accessToken = "my-token", taskId = 999)
        }
        assertEquals(404, error.statusCode)
    }

    @Test
    fun `updateTaskStatus sends PATCH and returns updated task`() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("/api/tasks/101/status", request.url.encodedPath)
            assertEquals(HttpMethod.Patch, request.method)
            respond(
                content = TASK_DETAIL_JSON,
                status = HttpStatusCode.OK,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalTasksApi(createPortalHttpClient(engine), baseUrlProvider())

        val detail = api.updateTaskStatus(
            accessToken = "my-token",
            taskId = 101,
            request = PortalStatusUpdateRequest(status = "DONE", comment = "Completed"),
        )

        assertEquals(101L, detail.id)
    }

    @Test
    fun `addComment sends POST and returns comment`() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("/api/tasks/101/comments", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            respond(
                content = COMMENT_RESPONSE_JSON,
                status = HttpStatusCode.OK,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalTasksApi(createPortalHttpClient(engine), baseUrlProvider())

        val comment = api.addComment(
            accessToken = "my-token",
            taskId = 101,
            request = PortalCreateCommentRequest(text = "Test comment"),
        )

        assertEquals(501L, comment.id)
        assertEquals(101L, comment.taskId)
        assertEquals("Test comment", comment.text)
        assertEquals("Vadim", comment.author)
    }

    @Test
    fun `addComment throws on 500`() = runBlocking {
        val engine = MockEngine {
            respond(
                content = """{"detail":"Internal server error"}""",
                status = HttpStatusCode.InternalServerError,
                headers = jsonHeaders,
            )
        }
        val api = KtorPortalTasksApi(createPortalHttpClient(engine), baseUrlProvider())

        val error = assertFailsWith<PortalApiException> {
            api.addComment(
                accessToken = "my-token",
                taskId = 101,
                request = PortalCreateCommentRequest(text = "Test"),
            )
        }
        assertEquals(500, error.statusCode)
    }

    private companion object {
        const val BASE_URL = "http://localhost:8001"

        fun baseUrlProvider() = BaseUrlProvider(
            listOf(ServerEnvironment(id = "test", label = "Test", baseUrl = BASE_URL, isDefault = true))
        )

        val TASKS_PAGE_JSON = """
            {
                "items": [
                    {
                        "id": 101,
                        "task_number": "FW-0001",
                        "title": "Ремонт стояка",
                        "raw_address": "Лиговский пр., 50",
                        "description": "Затопление подъезда",
                        "customer_name": "Иванов И.И.",
                        "customer_phone": "+79991234567",
                        "lat": 59.92,
                        "lon": 30.355,
                        "status": "IN_PROGRESS",
                        "priority": "URGENT",
                        "created_at": "2026-04-10T10:00:00",
                        "updated_at": "2026-04-14T08:00:00",
                        "planned_date": "2026-04-15T00:00:00",
                        "completed_at": null,
                        "assigned_user_id": 7,
                        "assigned_user_name": "Vadim Petrov",
                        "is_remote": false,
                        "is_paid": true,
                        "payment_amount": 2500.0,
                        "system_id": 1,
                        "system_type": "video_surveillance",
                        "defect_type": "Нет изображения",
                        "organization_id": 1,
                        "comments_count": 3
                    },
                    {
                        "id": 102,
                        "task_number": "FW-0002",
                        "title": "Замена домофона",
                        "raw_address": "Невский пр., 100",
                        "status": "NEW",
                        "priority": "PLANNED",
                        "created_at": "2026-04-13T15:00:00",
                        "updated_at": "2026-04-13T15:00:00",
                        "comments_count": 0
                    }
                ],
                "total": 2,
                "page": 1,
                "size": 20,
                "pages": 1
            }
        """.trimIndent()

        val TASK_DETAIL_JSON = """
            {
                "id": 101,
                "task_number": "FW-0001",
                "title": "Ремонт стояка",
                "raw_address": "Лиговский пр., 50",
                "description": "Затопление подъезда",
                "customer_name": "Иванов И.И.",
                "customer_phone": "+79991234567",
                "lat": 59.92,
                "lon": 30.355,
                "status": "IN_PROGRESS",
                "priority": "URGENT",
                "created_at": "2026-04-10T10:00:00",
                "updated_at": "2026-04-14T08:00:00",
                "planned_date": "2026-04-15T00:00:00",
                "completed_at": null,
                "assigned_user_id": 7,
                "assigned_user_name": "Vadim Petrov",
                "is_remote": false,
                "is_paid": true,
                "payment_amount": 2500.0,
                "system_id": 1,
                "system_type": "video_surveillance",
                "defect_type": "Нет изображения",
                "organization_id": 1,
                "comments": [
                    {
                        "id": 301,
                        "task_id": 101,
                        "text": "Работа начата",
                        "author": "Vadim Petrov",
                        "author_id": 7,
                        "old_status": "NEW",
                        "new_status": "IN_PROGRESS",
                        "created_at": "2026-04-14T08:00:00"
                    }
                ]
            }
        """.trimIndent()

        val COMMENT_RESPONSE_JSON = """
            {
                "id": 501,
                "task_id": 101,
                "text": "Test comment",
                "author": "Vadim",
                "author_id": 7,
                "old_status": null,
                "new_status": null,
                "old_assignee": null,
                "new_assignee": null,
                "created_at": "2026-04-14T12:00:00"
            }
        """.trimIndent()
    }
}
