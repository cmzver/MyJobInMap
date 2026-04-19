package com.fieldworker.next.domain.model

sealed interface AppResult<out T> {
    data class Success<T>(val value: T) : AppResult<T>

    data class Failure(val error: AppError) : AppResult<Nothing>
}

sealed interface AppError {
    data class Validation(val message: String) : AppError

    data class NotFound(val entity: String) : AppError

    data class Network(val message: String) : AppError

    data object Unauthorized : AppError

    data class Unknown(val message: String) : AppError
}
