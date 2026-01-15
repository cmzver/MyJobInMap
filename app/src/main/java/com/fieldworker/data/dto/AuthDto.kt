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
 * DTO для ответа с токеном
 */
data class TokenResponse(
    @SerializedName("access_token")
    val accessToken: String,
    
    @SerializedName("token_type")
    val tokenType: String,
    
    @SerializedName("user_id")
    val userId: Long,
    
    @SerializedName("username")
    val username: String,
    
    @SerializedName("role")
    val role: String,
    
    @SerializedName("full_name")
    val fullName: String
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
