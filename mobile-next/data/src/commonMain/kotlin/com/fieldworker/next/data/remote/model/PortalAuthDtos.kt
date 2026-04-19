package com.fieldworker.next.data.remote.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PortalTokenDto(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("token_type") val tokenType: String,
    @SerialName("user_id") val userId: Long,
    val username: String,
    val role: String,
    @SerialName("full_name") val fullName: String,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("organization_id") val organizationId: Long? = null,
    @SerialName("organization_name") val organizationName: String? = null,
)

@Serializable
data class PortalRefreshRequest(
    @SerialName("refresh_token") val refreshToken: String,
)

@Serializable
data class PortalUserDto(
    val id: Long,
    val username: String,
    @SerialName("full_name") val fullName: String,
    val email: String? = null,
    val phone: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val role: String,
    @SerialName("is_active") val isActive: Boolean,
    @SerialName("created_at") val createdAt: String,
    @SerialName("last_login") val lastLogin: String? = null,
    @SerialName("assigned_tasks_count") val assignedTasksCount: Int = 0,
    @SerialName("organization_id") val organizationId: Long? = null,
)
