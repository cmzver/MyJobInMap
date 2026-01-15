package com.fieldworker.data.dto

import android.os.Build
import com.google.gson.annotations.SerializedName

/**
 * DTO для регистрации FCM токена
 */
data class FCMTokenDto(
    @SerializedName("token")
    val token: String,
    
    @SerializedName("device_name")
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
