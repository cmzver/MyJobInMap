package com.fieldworker.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
<<<<<<< HEAD
import androidx.compose.material.icons.filled.Email
=======
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Destinations навигационного графа приложения.
 * 
 * Определяет все маршруты для Navigation Compose.
 * Bottom navigation tabs: Map, TaskList, Settings.
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
        label = "Список",
        icon = Icons.AutoMirrored.Filled.List
    )
    
    /** Настройки */
    data object Settings : Screen(
        route = "settings",
        label = "Настройки",
        icon = Icons.Default.Settings
    )
<<<<<<< HEAD

    /** Чаты */
    data object Chat : Screen(
        route = "chat",
        label = "Чаты",
        icon = Icons.Default.Email
    )
=======
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
    
    /** Экран разработчика (не в bottom nav) */
    data object Developer : Screen(route = "developer")

    /** Полноэкранная карточка объекта */
    data object ObjectCard : Screen(route = "object_card")
    
    companion object {
        /** Tabs для нижней панели навигации */
        val bottomNavItems: List<Screen>
<<<<<<< HEAD
            get() = listOf(Map, TaskList, Chat, Settings)
=======
            get() = listOf(Map, TaskList, Settings)
>>>>>>> 341f81020243ec851430a4081c49f876bdeaeb91
    }
}
