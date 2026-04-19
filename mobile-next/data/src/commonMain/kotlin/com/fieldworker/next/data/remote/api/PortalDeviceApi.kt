package com.fieldworker.next.data.remote.api

interface PortalDeviceApi {
    suspend fun registerDevice(
        accessToken: String,
        fcmToken: String,
        deviceName: String?,
    )

    suspend fun unregisterDevice(
        accessToken: String,
        fcmToken: String,
    )
}
