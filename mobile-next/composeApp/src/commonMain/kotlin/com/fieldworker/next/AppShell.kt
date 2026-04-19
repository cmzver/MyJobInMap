package com.fieldworker.next

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.automirrored.rounded.Assignment
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fieldworker.next.data.push.DeviceRegistrar
import com.fieldworker.next.domain.model.UserSession
import com.fieldworker.next.domain.usecase.ObserveSessionUseCase
import com.fieldworker.next.domain.usecase.RestoreSessionUseCase
import com.fieldworker.next.features.auth.LoginRoute
import com.fieldworker.next.features.chat.ChatListRoute
import com.fieldworker.next.features.chat.ChatRoute
import com.fieldworker.next.features.map.MapRoute
import com.fieldworker.next.features.profile.ProfileRoute
import com.fieldworker.next.features.tasks.TaskDetailRoute
import com.fieldworker.next.features.tasks.TaskListRoute
import org.koin.compose.koinInject

@Composable
fun AppShell() {
    val observeSessionUseCase = koinInject<ObserveSessionUseCase>()
    val restoreSessionUseCase = koinInject<RestoreSessionUseCase>()
    val deviceRegistrar = koinInject<DeviceRegistrar?>()
    val session by observeSessionUseCase().collectAsState(initial = UserSession.Guest)
    var isRestoring by remember { mutableStateOf(true) }
    var selectedTaskId by remember { mutableStateOf<Long?>(null) }
    var selectedChat by remember { mutableStateOf<Pair<Long, String>?>(null) }
    var currentTab by remember { mutableStateOf(RootTab.Tasks) }

    LaunchedEffect(Unit) {
        restoreSessionUseCase()
        isRestoring = false
    }

    // Register push token whenever user becomes authenticated
    LaunchedEffect(session.isAuthenticated) {
        if (session.isAuthenticated) {
            deviceRegistrar?.registerDevice()
        }
    }

    if (isRestoring) {
        Box(
            modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }
        return
    }

    if (!session.isAuthenticated) {
        LoginRoute()
        return
    }

    // Use Column instead of Scaffold to avoid nested SubcomposeLayout crash.
    // Scaffold's SubcomposeLayout + LazyColumn triggers "LayoutNode should be
    // attached to an owner" during forceMeasureTheSubtreeInternal.
    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .windowInsetsPadding(WindowInsets.statusBars),
            ) {
                when (currentTab) {
                    RootTab.Tasks -> TaskListRoute(
                        modifier = Modifier.fillMaxSize(),
                        onTaskSelected = { selectedTaskId = it },
                    )
                    RootTab.Map -> MapRoute(
                        modifier = Modifier.fillMaxSize(),
                        onTaskSelected = { selectedTaskId = it },
                    )
                    RootTab.Chat -> ChatListRoute(
                        modifier = Modifier.fillMaxSize(),
                        onConversationSelected = { id ->
                            selectedChat = id to "Чат #$id"
                        },
                    )
                    RootTab.Profile -> ProfileRoute()
                }
            }
            FwNavigationBar(
                currentTab = currentTab,
                onTabSelected = { currentTab = it },
            )
        }

        // Detail screens overlay on top
        selectedTaskId?.let { taskId ->
            TaskDetailRoute(
                taskId = taskId,
                onBack = { selectedTaskId = null },
            )
        }

        selectedChat?.let { (chatId, chatName) ->
            ChatRoute(
                conversationId = chatId,
                conversationName = chatName,
                onBack = { selectedChat = null },
            )
        }
    }
}

@Composable
private fun FwNavigationBar(
    currentTab: RootTab,
    onTabSelected: (RootTab) -> Unit,
) {
    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        RootTab.entries.forEach { tab ->
            val selected = currentTab == tab
            NavigationBarItem(
                selected = selected,
                onClick = { onTabSelected(tab) },
                icon = {
                    Icon(
                        imageVector = tab.icon,
                        contentDescription = tab.title,
                    )
                },
                label = {
                    Text(
                        text = tab.title,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                ),
            )
        }
    }
}

private enum class RootTab(
    val title: String,
    val icon: ImageVector,
) {
    Tasks("Заявки", Icons.AutoMirrored.Rounded.Assignment),
    Map("Карта", Icons.Outlined.Map),
    Chat("Чат", Icons.Outlined.ChatBubbleOutline),
    Profile("Профиль", Icons.Outlined.AccountCircle),
}
