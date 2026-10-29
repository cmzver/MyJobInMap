package com.fieldworker.ui.preview

import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.domain.model.FailedAction
import com.fieldworker.ui.components.FailedActionsDialog
import com.fieldworker.ui.main.AppDrawer
import com.fieldworker.ui.navigation.Screen
import com.fieldworker.ui.settings.ConnectionStatus
import com.fieldworker.ui.settings.SettingsScreen
import com.fieldworker.ui.theme.FieldWorkerTheme

@Preview(name = "Drawer", showBackground = true, showSystemUi = true)
@Composable
internal fun DrawerPreview() {
    FieldWorkerTheme {
        AppDrawer(
            userName = "Иван Полевой",
            roleLabel = "Работник",
            avatarUrl = null,
            baseUrl = null,
            authToken = null,
            currentScreen = Screen.TaskList,
            newTasksCount = 3,
            unreadChatCount = 12,
            onMap = {},
            onTaskList = {},
            onChat = {},
            onMyAddresses = {},
            onSettings = {},
            onProfile = {},
        )
    }
}

@Preview(name = "Settings", showBackground = true, showSystemUi = true)
@Composable
internal fun SettingsPreview() {
    val context = LocalContext.current
    val preferences = remember { AppPreferences(context) }
    FieldWorkerTheme {
        Surface {
            SettingsScreen(
                preferences = preferences,
                onTestConnection = {},
                connectionStatus = ConnectionStatus.IDLE,
            )
        }
    }
}

@Preview(name = "Failed actions", showBackground = true)
@Composable
internal fun FailedActionsPreview() {
    FieldWorkerTheme {
        FailedActionsDialog(
            actions = listOf(
                FailedAction(1, 10, "#1138996 · Ленинский пр., д.82", "Смена статуса → Выполнена",
                    "Сервер отклонил изменение: оно конфликтует с текущим состоянием заявки"),
                FailedAction(2, 11, "#1138997 · пр. Стачек, д.15", "Комментарий: «Заменил кран, проверил»",
                    "Не удалось отправить после нескольких попыток"),
            ),
            onRetry = {},
            onDiscard = {},
            onDismiss = {},
        )
    }
}

@Preview(name = "Profile", showBackground = true, showSystemUi = true)
@Composable
internal fun ProfilePreview() {
    FieldWorkerTheme {
        com.fieldworker.ui.settings.UserSettingsContent(
            state = com.fieldworker.ui.settings.UserSettingsUiState(
                fullName = "Иван Полевой",
                username = "ivan.polevoy",
            ),
            baseUrl = null,
            authToken = null,
            snackbarHostState = remember { androidx.compose.material3.SnackbarHostState() },
            onBack = {},
            onPickAvatar = {},
            onSaveName = {},
            onChangePassword = { _, _, _, _ -> },
        )
    }
}
