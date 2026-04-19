package com.fieldworker.next.data.remote.api

import com.fieldworker.next.data.remote.BaseUrlProvider
import com.fieldworker.next.data.remote.PortalApiException
import com.fieldworker.next.data.remote.model.PortalRefreshRequest
import com.fieldworker.next.data.remote.model.PortalTokenDto
import com.fieldworker.next.data.remote.model.PortalUserDto
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.Parameters
import io.ktor.http.contentType
import kotlinx.serialization.Serializable

class KtorPortalAuthApi(
    private val client: HttpClient,
    private val baseUrlProvider: BaseUrlProvider,
) : PortalAuthApi {

    override suspend fun login(username: String, password: String): PortalTokenDto {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.submitForm(
            url = "$baseUrl/api/auth/login",
            formParameters = Parameters.build {
                append("username", username)
                append("password", password)
            },
        )
        if (response.status.value != 200) {
            throw PortalApiException(
                statusCode = response.status.value,
                message = "Login failed: ${response.status.description}",
            )
        }
        return response.body()
    }

    override suspend fun refresh(request: PortalRefreshRequest): PortalTokenDto {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.post("$baseUrl/api/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        if (response.status.value != 200) {
            throw PortalApiException(
                statusCode = response.status.value,
                message = "Token refresh failed: ${response.status.description}",
            )
        }
        return response.body()
    }

    override suspend fun getCurrentUser(accessToken: String): PortalUserDto {
        val baseUrl = baseUrlProvider.getBaseUrl()
        val response = client.get("$baseUrl/api/auth/me") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
        }
        if (response.status.value != 200) {
            throw PortalApiException(
                statusCode = response.status.value,
                message = "Get current user failed: ${response.status.description}",
            )
        }
        return response.body()
    }
}
