package com.fieldworker.next.data.remote

import com.fieldworker.next.domain.model.ServerEnvironment

class BaseUrlProvider(private val environments: List<ServerEnvironment>) {
    @Volatile
    var activeEnvironmentId: String? = environments.firstOrNull { it.isDefault }?.id

    fun getBaseUrl(): String {
        val envId = activeEnvironmentId
        val env = envId?.let { id -> environments.firstOrNull { it.id == id } }
            ?: environments.firstOrNull { it.isDefault }
            ?: environments.first()
        return env.baseUrl
    }
}
