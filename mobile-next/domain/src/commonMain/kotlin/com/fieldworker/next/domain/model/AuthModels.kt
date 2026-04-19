package com.fieldworker.next.domain.model

data class Credentials(
    val username: String,
    val password: String,
)

data class ServerEnvironment(
    val id: String,
    val label: String,
    val baseUrl: String,
    val isDefault: Boolean = false,
)

enum class UserRole {
    WORKER,
    DISPATCHER,
    ADMIN,
}

data class UserSession(
    val userId: Long?,
    val fullName: String,
    val role: UserRole?,
    val organizationName: String?,
    val environment: ServerEnvironment?,
    val isAuthenticated: Boolean,
) {
    companion object {
        val Guest = UserSession(
            userId = null,
            fullName = "",
            role = null,
            organizationName = null,
            environment = null,
            isAuthenticated = false,
        )
    }
}
