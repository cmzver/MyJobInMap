package com.fieldworker.next.data.remote

import com.fieldworker.next.domain.model.AppError

class PortalApiException(
    val statusCode: Int? = null,
    override val message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

class PortalPayloadException(
    override val message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)

internal fun Throwable.toAppError(): AppError {
    return when (this) {
        is PortalApiException -> when (statusCode) {
            400, 422 -> AppError.Validation(message)
            401, 403 -> AppError.Unauthorized
            404 -> AppError.NotFound(entity = "Portal resource")
            in 500..599 -> AppError.Network(message)
            else -> AppError.Unknown(message)
        }

        is PortalPayloadException -> AppError.Unknown(message)
        else -> AppError.Network(message ?: "Portal request failed")
    }
}
