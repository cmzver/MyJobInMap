package com.fieldworker.next.data.remote.mapper

import com.fieldworker.next.data.remote.model.PortalTokenDto
import com.fieldworker.next.data.remote.model.PortalUserDto
import com.fieldworker.next.domain.model.ServerEnvironment
import com.fieldworker.next.domain.model.UserRole
import com.fieldworker.next.domain.model.UserSession

fun PortalTokenDto.toUserSession(environment: ServerEnvironment): UserSession {
    return UserSession(
        userId = userId,
        fullName = fullName.ifBlank { username },
        role = role.toDomainUserRole(),
        organizationName = organizationName.nullIfBlank(),
        environment = environment,
        isAuthenticated = true,
    )
}

fun PortalUserDto.toUserSession(environment: ServerEnvironment): UserSession {
    return UserSession(
        userId = id,
        fullName = fullName.ifBlank { username },
        role = role.toDomainUserRole(),
        organizationName = null,
        environment = environment,
        isAuthenticated = true,
    )
}

private fun String.toDomainUserRole(): UserRole? {
    return when (trim().lowercase()) {
        "worker" -> UserRole.WORKER
        "dispatcher" -> UserRole.DISPATCHER
        "admin", "manager", "superadmin" -> UserRole.ADMIN
        else -> null
    }
}

private fun String?.nullIfBlank(): String? {
    return this?.trim()?.takeIf { it.isNotEmpty() }
}
