package com.fieldworker.next.di

import com.fieldworker.next.data.PortalDataModule
import com.fieldworker.next.data.push.DeviceRegistrar
import com.fieldworker.next.data.push.PushTokenProvider
import com.fieldworker.next.data.remote.store.PortalSessionStore
import com.fieldworker.next.domain.model.ServerEnvironment
import com.fieldworker.next.domain.repository.ChatRepository
import com.fieldworker.next.domain.repository.SessionRepository
import com.fieldworker.next.domain.repository.TaskRepository
import com.fieldworker.next.domain.usecase.AddTaskCommentUseCase
import com.fieldworker.next.domain.usecase.GetAvailableEnvironmentsUseCase
import com.fieldworker.next.domain.usecase.GetMessagesUseCase
import com.fieldworker.next.domain.usecase.MarkReadUseCase
import com.fieldworker.next.domain.usecase.ObserveConversationsUseCase
import com.fieldworker.next.domain.usecase.ObserveSessionUseCase
import com.fieldworker.next.domain.usecase.ObserveTaskBoardUseCase
import com.fieldworker.next.domain.usecase.ObserveTaskDetailUseCase
import com.fieldworker.next.domain.usecase.RefreshConversationsUseCase
import com.fieldworker.next.domain.usecase.RefreshTasksUseCase
import com.fieldworker.next.domain.usecase.RestoreSessionUseCase
import com.fieldworker.next.domain.usecase.SendMessageUseCase
import com.fieldworker.next.domain.usecase.SignInUseCase
import com.fieldworker.next.domain.usecase.SignOutUseCase
import com.fieldworker.next.domain.usecase.UpdateTaskStatusUseCase
import com.fieldworker.next.domain.usecase.UploadTaskPhotoUseCase
import com.fieldworker.next.features.auth.LoginViewModel
import com.fieldworker.next.features.chat.ChatListViewModel
import com.fieldworker.next.features.chat.ChatViewModel
import com.fieldworker.next.features.map.MapViewModel
import com.fieldworker.next.features.profile.ProfileViewModel
import com.fieldworker.next.features.settings.InMemoryThemeStore
import com.fieldworker.next.features.settings.ThemeManager
import com.fieldworker.next.features.settings.ThemeStore
import com.fieldworker.next.features.tasks.TaskDetailViewModel
import com.fieldworker.next.features.tasks.TaskListViewModel
import org.koin.core.module.dsl.factoryOf
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module

val dataModule = module {
    single {
        PortalDataModule(
            environments = listOf(
                ServerEnvironment(
                    id = "prod",
                    label = "Production",
                    baseUrl = "http://10.0.2.2:8001",
                    isDefault = true,
                ),
            ),
            sessionStore = com.fieldworker.next.data.remote.store.InMemoryPortalSessionStore(),
        )
    }
    single<SessionRepository> { get<PortalDataModule>().sessionRepository }
    single<TaskRepository> { get<PortalDataModule>().taskRepository }
    single<ChatRepository> { get<PortalDataModule>().chatRepository }
}

fun dataModule(
    sessionStore: PortalSessionStore,
    pushTokenProvider: PushTokenProvider? = null,
) = module {
    single {
        PortalDataModule(
            environments = listOf(
                ServerEnvironment(
                    id = "prod",
                    label = "Production",
                    baseUrl = "http://10.0.2.2:8001",
                    isDefault = true,
                ),
            ),
            sessionStore = sessionStore,
            pushTokenProvider = pushTokenProvider,
        )
    }
    single<SessionRepository> { get<PortalDataModule>().sessionRepository }
    single<TaskRepository> { get<PortalDataModule>().taskRepository }
    single<ChatRepository> { get<PortalDataModule>().chatRepository }
    single<DeviceRegistrar?> { get<PortalDataModule>().deviceRegistrar }
}

val domainModule = module {
    factoryOf(::ObserveSessionUseCase)
    factoryOf(::GetAvailableEnvironmentsUseCase)
    factoryOf(::SignInUseCase)
    factoryOf(::SignOutUseCase)
    factoryOf(::ObserveTaskBoardUseCase)
    factoryOf(::ObserveTaskDetailUseCase)
    factoryOf(::UpdateTaskStatusUseCase)
    factoryOf(::AddTaskCommentUseCase)
    factoryOf(::UploadTaskPhotoUseCase)
    factoryOf(::RefreshTasksUseCase)
    factoryOf(::RestoreSessionUseCase)
    factoryOf(::ObserveConversationsUseCase)
    factoryOf(::RefreshConversationsUseCase)
    factoryOf(::GetMessagesUseCase)
    factoryOf(::SendMessageUseCase)
    factoryOf(::MarkReadUseCase)
}

val viewModelModule = module {
    single<ThemeStore> { InMemoryThemeStore() }
    singleOf(::ThemeManager)
    factoryOf(::LoginViewModel)
    factoryOf(::TaskListViewModel)
    factoryOf(::TaskDetailViewModel)
    factoryOf(::ProfileViewModel)
    factoryOf(::ChatListViewModel)
    factoryOf(::ChatViewModel)
    factoryOf(::MapViewModel)
}

fun viewModelModule(themeStore: ThemeStore) = module {
    single<ThemeStore> { themeStore }
    singleOf(::ThemeManager)
    factoryOf(::LoginViewModel)
    factoryOf(::TaskListViewModel)
    factoryOf(::TaskDetailViewModel)
    factoryOf(::ProfileViewModel)
    factoryOf(::ChatListViewModel)
    factoryOf(::ChatViewModel)
    factoryOf(::MapViewModel)
}

val appModules = listOf(dataModule, domainModule, viewModelModule)

fun appModules(
    sessionStore: PortalSessionStore,
    pushTokenProvider: PushTokenProvider? = null,
    themeStore: ThemeStore = InMemoryThemeStore(),
) =
    listOf(dataModule(sessionStore, pushTokenProvider), domainModule, viewModelModule(themeStore))
