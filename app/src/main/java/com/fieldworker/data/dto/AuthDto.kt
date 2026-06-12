package com.fieldworker.data.dto

import kotlinx.serialization.Serializable

/**
 * DTO для запроса на авторизацию
 */
@Serializable
data class LoginRequest(
    val username: String,
    
    val password: String
)

/**
 * DTO для ответа с токеном (access + refresh)
 */
@Serializable
data class TokenResponse(
    val accessToken: String,
    
    val refreshToken: String,
    
    val tokenType: String,
    
    val userId: Long,
    
    val username: String,
    
    val role: String,
    
    val fullName: String,

    val avatarUrl: String? = null
)

/**
 * DTO для запроса обновления токена
 */
@Serializable
data class RefreshTokenRequest(
    val refreshToken: String
)

/**
 * DTO для обновления профиля (PATCH /api/auth/profile)
 */
@Serializable
data class UpdateProfileRequest(
    val fullName: String? = null,

    val email: String? = null,

    val phone: String? = null
)

/**
 * DTO для смены пароля (PATCH /api/auth/password)
 */
@Serializable
data class ChangePasswordRequest(
    val currentPassword: String,

    val newPassword: String
)

/**
 * DTO ответа на смену пароля
 */
@Serializable
data class SimpleSuccessDto(
    val success: Boolean = true,

    val message: String? = null
)

/**
 * DTO для информации о текущем пользователе
 */
@Serializable
data class UserDto(
    val id: Long,
    
    val username: String,
    
    val fullName: String,
    
    val email: String?,
    
    val phone: String?,

    val avatarUrl: String? = null,

    val role: String,
    
    val isActive: Boolean,
    
    val createdAt: String,
    
    val lastLogin: String?,
    
    val assignedTasksCount: Int = 0
)
