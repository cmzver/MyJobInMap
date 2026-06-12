package com.fieldworker.data.dto

import android.os.Build
import kotlinx.serialization.Serializable

/**
 * DTO для регистрации FCM токена
 */
@Serializable
data class FCMTokenDto(
    val token: String,
    
    val deviceName: String? = null
) {
    companion object {
        /**
         * Создаёт DTO с информацией о текущем устройстве
         */
        fun withDeviceInfo(token: String): FCMTokenDto {
            val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
            return FCMTokenDto(token, deviceName)
        }
    }
}
