package com.fieldworker.next.data.remote.api

import com.fieldworker.next.data.remote.BaseUrlProvider
import com.fieldworker.next.data.remote.PortalApiException
import com.fieldworker.next.data.remote.model.PortalCommentDto
import com.fieldworker.next.data.remote.model.PortalCreateCommentRequest
import com.fieldworker.next.data.remote.model.PortalPageDto
import com.fieldworker.next.data.remote.model.PortalPhotoDto
import com.fieldworker.next.data.remote.model.PortalStatusUpdateRequest
import com.fieldworker.next.data.remote.model.PortalTaskDetailDto
import com.fieldworker.next.data.remote.model.PortalTaskListItemDto
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType

class KtorPortalTasksApi(
    private val client: HttpClient,
    private val baseUrlProvider: BaseUrlProvider,
) : PortalTasksApi {

    override suspend fun getTasks(
        accessToken: String,
        page: Int,
        size: Int,
        statuses: List<String>,
    ): PortalPageDto<PortalTaskListItemDto> {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.get("$baseUrl/api/tasks") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            parameter("page", page)
            parameter("size", size)
            statuses.forEach { status ->
                parameter("status", status)
            }
        }
        if (response.status.value != 200) {
            throw PortalApiException(
                statusCode = response.status.value,
                message = "Get tasks failed: ${response.status.description}",
            )
        }
        return response.body()
    }

    override suspend fun getTaskDetail(
        accessToken: String,
        taskId: Long,
    ): PortalTaskDetailDto {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.get("$baseUrl/api/tasks/$taskId") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
        }
        if (response.status.value != 200) {
            throw PortalApiException(
                statusCode = response.status.value,
                message = "Get task detail failed: ${response.status.description}",
            )
        }
        return response.body()
    }

    override suspend fun updateTaskStatus(
        accessToken: String,
        taskId: Long,
        request: PortalStatusUpdateRequest,
    ): PortalTaskDetailDto {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.patch("$baseUrl/api/tasks/$taskId/status") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        if (response.status.value != 200) {
            throw PortalApiException(
                statusCode = response.status.value,
                message = "Update task status failed: ${response.status.description}",
            )
        }
        return response.body()
    }

    override suspend fun addComment(
        accessToken: String,
        taskId: Long,
        request: PortalCreateCommentRequest,
    ): PortalCommentDto {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.post("$baseUrl/api/tasks/$taskId/comments") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        if (response.status.value !in 200..201) {
            throw PortalApiException(
                statusCode = response.status.value,
                message = "Add comment failed: ${response.status.description}",
            )
        }
        return response.body()
    }

    override suspend fun getPhotos(
        accessToken: String,
        taskId: Long,
    ): List<PortalPhotoDto> {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.get("$baseUrl/api/tasks/$taskId/photos") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
        }
        if (response.status.value != 200) {
            throw PortalApiException(
                statusCode = response.status.value,
                message = "Get photos failed: ${response.status.description}",
            )
        }
        return response.body()
    }

    override suspend fun uploadPhoto(
        accessToken: String,
        taskId: Long,
        fileName: String,
        fileBytes: ByteArray,
        mimeType: String,
    ): PortalPhotoDto {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.post("$baseUrl/api/tasks/$taskId/photos") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            setBody(MultiPartFormDataContent(formData {
                append("file", fileBytes, io.ktor.http.Headers.build {
                    append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                    append(HttpHeaders.ContentType, mimeType)
                })
            }))
        }
        if (response.status.value !in 200..201) {
            throw PortalApiException(
                statusCode = response.status.value,
                message = "Upload photo failed: ${response.status.description}",
            )
        }
        return response.body()
    }
}
