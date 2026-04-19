package com.fieldworker.next.navigation

import kotlinx.serialization.Serializable

@Serializable
sealed interface Route {
    @Serializable
    data object Login : Route

    @Serializable
    data object TaskList : Route

    @Serializable
    data class TaskDetail(val taskId: Long) : Route

    @Serializable
    data object Map : Route

    @Serializable
    data object ChatList : Route

    @Serializable
    data object Profile : Route
}

enum class RootTab(val title: String, val route: Route) {
    Tasks("Заявки", Route.TaskList),
    Map("Карта", Route.Map),
    Chat("Чат", Route.ChatList),
    Profile("Профиль", Route.Profile),
}
