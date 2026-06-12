package com.fieldworker.data.dto

import kotlinx.serialization.Serializable

/**
 * DTO ответа на смену пароля.
 *
 * Оставлен ручным: сервер не описывает схему ответа этого эндпоинта в OpenAPI,
 * поэтому модель не генерируется. Остальные auth-DTO выведены из OpenAPI
 * (Token, UserResponse, RefreshRequest, ProfileUpdate, PasswordChange).
 */
@Serializable
data class SimpleSuccessDto(
    val success: Boolean = true,
    val message: String? = null
)
