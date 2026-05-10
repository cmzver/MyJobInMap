package com.fieldworker.data.dto

import com.google.gson.annotations.SerializedName

/**
 * DTO для запроса на авторизацию
 */
data class LoginRequest(
    @SerializedName("username")
    val username: String,
    
    @SerializedName("password")
    val password: String
)

/**
 * DTO для ответа с токеном (access + refresh)
 */
data class TokenResponse(
    @SerializedName("access_token")
    val accessToken: String,
    
    @SerializedName("refresh_token")
    val refreshToken: String,
    
    @SerializedName("token_type")
    val tokenType: String,
    
    @SerializedName("user_id")
    val userId: Long,
    
    @SerializedName("username")
    val username: String,
    
    @SerializedName("role")
    val role: String,
    
    @SerializedName("full_name")
    val fullName: String,

    @SerializedName("avatar_url")
    val avatarUrl: String? = null
)

/**
 * DTO для запроса обновления токена
 */
data class RefreshTokenRequest(
    @SerializedName("refresh_token")
    val refreshToken: String
)

/**
 * DTO для обновления профиля (PATCH /api/auth/profile)
 */
data class UpdateProfileRequest(
    @SerializedName("full_name")
    val fullName: String? = null,

    @SerializedName("email")
    val email: String? = null,

    @SerializedName("phone")
    val phone: String? = null
)

/**
 * DTO для смены пароля (PATCH /api/auth/password)
 */
data class ChangePasswordRequest(
    @SerializedName("current_password")
    val currentPassword: String,

    @SerializedName("new_password")
    val newPassword: String
)

/**
 * DTO ответа на смену пароля
 */
data class SimpleSuccessDto(
    @SerializedName("success")
    val success: Boolean = true,

    @SerializedName("message")
    val message: String? = null
)

/**
 * DTO для информации о текущем пользователе
 */
data class UserDto(
    @SerializedName("id")
    val id: Long,
    
    @SerializedName("username")
    val username: String,
    
    @SerializedName("full_name")
    val fullName: String,
    
    @SerializedName("email")
    val email: String?,
    
    @SerializedName("phone")
    val phone: String?,

    @SerializedName("avatar_url")
    val avatarUrl: String? = null,

    @SerializedName("role")
    val role: String,
    
    @SerializedName("is_active")
    val isActive: Boolean,
    
    @SerializedName("created_at")
    val createdAt: String,
    
    @SerializedName("last_login")
    val lastLogin: String?,
    
    @SerializedName("assigned_tasks_count")
    val assignedTasksCount: Int = 0
)
