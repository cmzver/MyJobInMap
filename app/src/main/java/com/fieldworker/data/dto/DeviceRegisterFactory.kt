package com.fieldworker.data.dto

import android.os.Build
import com.fieldworker.data.remote.generated.DeviceRegister

/**
 * Создаёт [DeviceRegister] с информацией о текущем устройстве.
 * Generated-модель не содержит фабрик, поэтому device-name заполняется здесь.
 */
fun deviceRegisterWithInfo(token: String): DeviceRegister =
    DeviceRegister(
        token = token,
        deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
    )
