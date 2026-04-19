package com.fieldworker.next.data.remote.api

import com.fieldworker.next.data.remote.model.PortalRefreshRequest
import com.fieldworker.next.data.remote.model.PortalTokenDto
import com.fieldworker.next.data.remote.model.PortalUserDto

interface PortalAuthApi {
    suspend fun login(
        username: String,
        password: String,
    ): PortalTokenDto

    suspend fun refresh(request: PortalRefreshRequest): PortalTokenDto

    suspend fun getCurrentUser(accessToken: String): PortalUserDto
}
