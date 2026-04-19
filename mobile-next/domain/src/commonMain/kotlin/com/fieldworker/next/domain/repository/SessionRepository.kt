package com.fieldworker.next.domain.repository

import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.Credentials
import com.fieldworker.next.domain.model.ServerEnvironment
import com.fieldworker.next.domain.model.UserSession
import kotlinx.coroutines.flow.Flow

interface SessionRepository {
    fun observeSession(): Flow<UserSession>

    fun getAvailableEnvironments(): List<ServerEnvironment>

    suspend fun restoreSession(): AppResult<UserSession>

    suspend fun signIn(
        credentials: Credentials,
        environmentId: String,
    ): AppResult<UserSession>

    suspend fun signOut()
}
