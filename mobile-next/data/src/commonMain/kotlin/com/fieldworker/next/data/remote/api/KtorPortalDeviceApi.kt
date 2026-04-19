package com.fieldworker.next.data.remote.api

import com.fieldworker.next.data.remote.BaseUrlProvider
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.serialization.Serializable

@Serializable
private data class DeviceRegisterBody(
    val token: String,
    val device_name: String? = null,
)

class KtorPortalDeviceApi(
    private val client: HttpClient,
    private val baseUrlProvider: BaseUrlProvider,
) : PortalDeviceApi {

    override suspend fun registerDevice(
        accessToken: String,
        fcmToken: String,
        deviceName: String?,
    ) {
        val baseUrl = baseUrlProvider.getBaseUrl()
        client.post("$baseUrl/api/devices") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            contentType(ContentType.Application.Json)
            setBody(DeviceRegisterBody(token = fcmToken, device_name = deviceName))
        }
    }

    override suspend fun unregisterDevice(
        accessToken: String,
        fcmToken: String,
    ) {
        val baseUrl = baseUrlProvider.getBaseUrl()
        client.delete("$baseUrl/api/devices/unregister") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            contentType(ContentType.Application.Json)
            setBody(DeviceRegisterBody(token = fcmToken))
        }
    }
}
