package com.fieldworker.next.data.push

import com.fieldworker.next.data.remote.api.PortalDeviceApi
import com.fieldworker.next.data.remote.store.PortalSessionStore

class DeviceRegistrar(
    private val deviceApi: PortalDeviceApi,
    private val sessionStore: PortalSessionStore,
    private val pushTokenProvider: PushTokenProvider,
) {
    /**
     * Registers the current device's push token with the server.
     * Safe to call multiple times — server does upsert.
     */
    suspend fun registerDevice() {
        val session = sessionStore.read() ?: return
        val token = pushTokenProvider.getToken() ?: return
        val deviceName = pushTokenProvider.getDeviceName()

        try {
            deviceApi.registerDevice(
                accessToken = session.accessToken,
                fcmToken = token,
                deviceName = deviceName,
            )
        } catch (_: Exception) {
            // Silently ignore — non-critical, will retry next launch
        }
    }

    /**
     * Unregisters the device on logout.
     */
    suspend fun unregisterDevice() {
        val session = sessionStore.read() ?: return
        val token = pushTokenProvider.getToken() ?: return

        try {
            deviceApi.unregisterDevice(
                accessToken = session.accessToken,
                fcmToken = token,
            )
        } catch (_: Exception) {
            // Silently ignore
        }
    }
}
