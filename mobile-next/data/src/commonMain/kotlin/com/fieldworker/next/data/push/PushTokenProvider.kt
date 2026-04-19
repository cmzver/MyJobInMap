package com.fieldworker.next.data.push

/**
 * Platform abstraction for push notification token management.
 * Implemented in composeApp per platform (Firebase on Android, APNS on iOS).
 */
interface PushTokenProvider {
    /**
     * Returns the current FCM/APNS token, or null if unavailable.
     */
    suspend fun getToken(): String?

    /**
     * Returns a human-readable device name.
     */
    fun getDeviceName(): String
}
