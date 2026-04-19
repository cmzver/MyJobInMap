package com.fieldworker.next.data

import com.fieldworker.next.data.push.DeviceRegistrar
import com.fieldworker.next.data.push.PushTokenProvider
import com.fieldworker.next.data.remote.BaseUrlProvider
import com.fieldworker.next.data.remote.api.KtorPortalAuthApi
import com.fieldworker.next.data.remote.api.KtorPortalChatApi
import com.fieldworker.next.data.remote.api.KtorPortalDeviceApi
import com.fieldworker.next.data.remote.api.KtorPortalTasksApi
import com.fieldworker.next.data.remote.api.PortalAuthApi
import com.fieldworker.next.data.remote.api.PortalChatApi
import com.fieldworker.next.data.remote.api.PortalDeviceApi
import com.fieldworker.next.data.remote.api.PortalTasksApi
import com.fieldworker.next.data.remote.createPlatformEngine
import com.fieldworker.next.data.remote.createPortalHttpClient
import com.fieldworker.next.data.remote.store.PortalSessionStore
import com.fieldworker.next.data.repository.RemoteChatRepository
import com.fieldworker.next.data.repository.RemoteSessionRepository
import com.fieldworker.next.data.repository.RemoteTaskRepository
import com.fieldworker.next.domain.model.ServerEnvironment
import io.ktor.client.HttpClient

class PortalDataModule(
    environments: List<ServerEnvironment>,
    sessionStore: PortalSessionStore,
    pushTokenProvider: PushTokenProvider? = null,
) {
    private val baseUrlProvider = BaseUrlProvider(environments)

    val httpClient: HttpClient = createPortalHttpClient(createPlatformEngine())

    val authApi: PortalAuthApi = KtorPortalAuthApi(httpClient, baseUrlProvider)

    val tasksApi: PortalTasksApi = KtorPortalTasksApi(httpClient, baseUrlProvider)

    val chatApi: PortalChatApi = KtorPortalChatApi(httpClient, baseUrlProvider)

    val deviceApi: PortalDeviceApi = KtorPortalDeviceApi(httpClient, baseUrlProvider)

    val sessionRepository: RemoteSessionRepository = RemoteSessionRepository(
        authApi = authApi,
        sessionStore = sessionStore,
        environments = environments,
        baseUrlProvider = baseUrlProvider,
    )

    val taskRepository: RemoteTaskRepository = RemoteTaskRepository(
        tasksApi = tasksApi,
        sessionStore = sessionStore,
        baseUrlProvider = baseUrlProvider,
    )

    val chatRepository: RemoteChatRepository = RemoteChatRepository(
        chatApi = chatApi,
        sessionStore = sessionStore,
    )

    val deviceRegistrar: DeviceRegistrar? = pushTokenProvider?.let {
        DeviceRegistrar(
            deviceApi = deviceApi,
            sessionStore = sessionStore,
            pushTokenProvider = it,
        )
    }
}
