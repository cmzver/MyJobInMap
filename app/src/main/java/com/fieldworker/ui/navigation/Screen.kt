package com.fieldworker.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Destinations навигационного графа приложения.
 * 
 * Определяет все маршруты для Navigation Compose.
 * Нижняя навигация: Карта, Заявки, Чаты, Ещё (настройки + второстепенные разделы).
 * Дополнительные экраны: Developer (полноэкранный).
 */
sealed class Screen(
    val route: String,
    val label: String = "",
    val icon: ImageVector? = null
) {
    /** Карта с заявками */
    data object Map : Screen(
        route = "map",
        label = "Карта",
        icon = Icons.Default.Place
    )
    
    /** Список заявок */
    data object TaskList : Screen(
        route = "task_list",
        label = "Заявки",
        icon = Icons.AutoMirrored.Filled.List
    )
    
    /** «Ещё»: настройки, профиль и второстепенные разделы (Мои адреса) */
    data object Settings : Screen(
        route = "settings",
        label = "Ещё",
        icon = Icons.Default.Menu
    )

    /** Чаты */
    data object Chat : Screen(
        route = "chat",
        label = "Чаты",
        icon = Icons.Default.Email
    )
    
    /** Экран разработчика (не в bottom nav) */
    data object Developer : Screen(route = "developer")

    /** Настройки пользователя (имя, аватар, пароль) */
    data object UserSettings : Screen(
        route = "user_settings",
        label = "Профиль",
        icon = Icons.Default.Person
    )

    /** Полноэкранная карточка объекта */
    data object ObjectCard : Screen(route = "object_card")

    /** Раздел «Мои адреса» (открывается из «Ещё») */
    data object MyAddresses : Screen(
        route = "my_addresses",
        label = "Мои адреса",
        icon = Icons.Default.Home
    )

    companion object {
        /** Tabs для нижней панели навигации */
        val bottomNavItems: List<Screen>
            get() = listOf(Map, TaskList, Chat, Settings)
    }
}
