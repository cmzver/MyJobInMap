package com.fieldworker.next.data.remote.store

import com.fieldworker.next.data.remote.model.PortalTokenDto

interface PortalSessionStore {
    suspend fun read(): StoredPortalSession?

    suspend fun write(session: StoredPortalSession)

    suspend fun clear()
}

data class StoredPortalSession(
    val environmentId: String,
    val accessToken: String,
    val refreshToken: String,
    val tokenType: String,
    val userId: Long,
    val username: String,
)

fun PortalTokenDto.toStoredSession(environmentId: String): StoredPortalSession {
    return StoredPortalSession(
        environmentId = environmentId,
        accessToken = accessToken,
        refreshToken = refreshToken,
        tokenType = tokenType,
        userId = userId,
        username = username,
    )
}

fun StoredPortalSession.withToken(token: PortalTokenDto): StoredPortalSession {
    return copy(
        accessToken = token.accessToken,
        refreshToken = token.refreshToken,
        tokenType = token.tokenType,
        userId = token.userId,
        username = token.username,
    )
}
