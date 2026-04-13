package com.fieldworker.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.fieldworker.data.preferences.AppPreferences
import kotlinx.coroutines.launch

/**
 * Экран настроек приложения
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    preferences: AppPreferences,
    onTestConnection: (String) -> Unit,
    connectionStatus: ConnectionStatus,
    onCheckForUpdates: () -> Unit = {},
    isCheckingForUpdates: Boolean = false,
    onOpenDeveloperScreen: () -> Unit = {},
    onLogout: () -> Unit = {}
) {
    val context = LocalContext.current
    var serverUrl by remember { mutableStateOf(preferences.getServerUrl()) }
    var serverPort by remember { mutableStateOf(preferences.getServerPort().toString()) }
    var hideDoneTasks by remember { mutableStateOf(preferences.getHideDoneTasks()) }
    var showMyLocation by remember { mutableStateOf(preferences.getShowMyLocation()) }
    var notificationsEnabled by remember { mutableStateOf(preferences.getNotificationsEnabled()) }
    var notifyNewTasks by remember { mutableStateOf(preferences.getNotifyNewTasks()) }
    var notifyStatusChange by remember { mutableStateOf(preferences.getNotifyStatusChange()) }
    var notifyChatMessages by remember { mutableStateOf(preferences.getNotifyChatMessages()) }
    var showResetDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    
    // Счётчик тапов для входа в режим разработчика
    var versionTapCount by remember { mutableStateOf(0) }
    
    // Получаем версию приложения
    val appVersionInfo = remember {
        try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            val versionCode = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode
            }
            (packageInfo.versionName ?: "1.0.0") to versionCode
        } catch (e: Exception) {
            "1.0.0" to 1
        }
    }
    val appVersion = appVersionInfo.first
    val appVersionCode = appVersionInfo.second
    val userName = preferences.getUserFullName() ?: preferences.getUsername() ?: "Пользователь"
    val userRole = roleLabel(preferences.getUserRole())
    
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Настройки") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
        ) {
            // === Профиль ===
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Icon(
                    Icons.Default.AccountCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(44.dp)
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = userName,
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        text = if (userRole.isNotEmpty()) userRole else "Пользователь",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 20.dp))

            // === Подключение к серверу ===
            SectionLabel("Сервер")

            Column(
                modifier = Modifier.padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("URL сервера") },
                    placeholder = { Text("https://example.com") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                if (!serverUrl.trimStart().startsWith("https://", ignoreCase = true)) {
                    OutlinedTextField(
                        value = serverPort,
                        onValueChange = { serverPort = it.filter { c -> c.isDigit() } },
                        label = { Text("Порт") },
                        placeholder = { Text("8001") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            preferences.setServerUrl(serverUrl)
                            preferences.setServerPort(serverPort.toIntOrNull() ?: 8001)
                            scope.launch { snackbarHostState.showSnackbar("Сохранено") }
                        },
                        modifier = Modifier.weight(1f)
                    ) { Text("Сохранить") }

                    OutlinedButton(
                        onClick = { onTestConnection(buildServerEndpointPreview(serverUrl, serverPort)) },
                        modifier = Modifier.weight(1f)
                    ) { Text("Проверить") }
                }

                // Статус подключения (компактный)
                if (connectionStatus != ConnectionStatus.IDLE) {
                    val (statusText, statusColor) = when (connectionStatus) {
                        ConnectionStatus.TESTING -> "Проверяем..." to MaterialTheme.colorScheme.onSurfaceVariant
                        ConnectionStatus.SUCCESS -> "Сервер доступен" to MaterialTheme.colorScheme.primary
                        is ConnectionStatus.ERROR -> connectionStatus.message to MaterialTheme.colorScheme.error
                        else -> "" to MaterialTheme.colorScheme.onSurfaceVariant
                    }
                    Text(
                        text = statusText,
                        style = MaterialTheme.typography.bodySmall,
                        color = statusColor
                    )
                }
            }

            // === Отображение ===
            SectionLabel("Отображение")

            MinimalSwitch(
                title = "Скрывать выполненные",
                subtitle = "Не показывать заявки со статусом «Выполнена»",
                checked = hideDoneTasks,
                onCheckedChange = { hideDoneTasks = it; preferences.setHideDoneTasks(it) }
            )

            MinimalSwitch(
                title = "Моё местоположение",
                subtitle = "Показывать на карте",
                checked = showMyLocation,
                onCheckedChange = { showMyLocation = it; preferences.setShowMyLocation(it) }
            )

            // === Уведомления ===
            SectionLabel("Уведомления")

            MinimalSwitch(
                title = "Push-уведомления",
                checked = notificationsEnabled,
                onCheckedChange = { notificationsEnabled = it; preferences.setNotificationsEnabled(it) }
            )

            if (notificationsEnabled) {
                MinimalSwitch(
                    title = "Новые задачи",
                    checked = notifyNewTasks,
                    onCheckedChange = { notifyNewTasks = it; preferences.setNotifyNewTasks(it) }
                )
                MinimalSwitch(
                    title = "Изменение статуса",
                    checked = notifyStatusChange,
                    onCheckedChange = { notifyStatusChange = it; preferences.setNotifyStatusChange(it) }
                )
                MinimalSwitch(
                    title = "Сообщения в чате",
                    checked = notifyChatMessages,
                    onCheckedChange = { notifyChatMessages = it; preferences.setNotifyChatMessages(it) }
                )
            }

            // === Обновления ===
            SectionLabel("Обновления")

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "v$appVersion • код $appVersionCode",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedButton(
                    onClick = onCheckForUpdates,
                    enabled = !isCheckingForUpdates
                ) {
                    if (isCheckingForUpdates) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("Проверить")
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))

            // === Сброс и выход ===
            MinimalRow(
                title = "Сбросить настройки",
                titleColor = MaterialTheme.colorScheme.onSurface,
                onClick = { showResetDialog = true }
            )

            MinimalRow(
                title = "Выйти из аккаунта",
                titleColor = MaterialTheme.colorScheme.error,
                onClick = onLogout
            )

            // Версия (5 тапов = режим разработчика)
            Text(
                text = buildString {
                    append("FieldWorker v$appVersion")
                    if (versionTapCount > 0) append(" • ещё ${5 - versionTapCount}")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        versionTapCount++
                        if (versionTapCount >= 5) {
                            versionTapCount = 0
                            onOpenDeveloperScreen()
                        }
                    }
                    .padding(vertical = 24.dp)
            )
        }
    }

    // Диалог сброса
    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            title = { Text("Сбросить настройки?") },
            text = { Text("Все настройки будут сброшены до значений по умолчанию.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        preferences.resetToDefaults()
                        serverUrl = preferences.getServerUrl()
                        serverPort = preferences.getServerPort().toString()
                        hideDoneTasks = preferences.getHideDoneTasks()
                        showMyLocation = preferences.getShowMyLocation()
                        notificationsEnabled = preferences.getNotificationsEnabled()
                        notifyNewTasks = preferences.getNotifyNewTasks()
                        notifyStatusChange = preferences.getNotifyStatusChange()
                        notifyChatMessages = preferences.getNotifyChatMessages()

                        showResetDialog = false
                        scope.launch {
                            snackbarHostState.showSnackbar("Настройки сброшены")
                        }
                    }
                ) {
                    Text("Сбросить")
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetDialog = false }) {
                    Text("Отмена")
                }
            }
        )
    }
}

// ===== Minimal helper composables =====

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 20.dp, top = 20.dp, bottom = 8.dp)
    )
}

@Composable
private fun MinimalSwitch(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    subtitle: String? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun MinimalRow(
    title: String,
    titleColor: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit
) {
    Text(
        text = title,
        style = MaterialTheme.typography.bodyLarge,
        color = titleColor,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 14.dp)
    )
}

sealed class ConnectionStatus {
    data object IDLE : ConnectionStatus()
    data object TESTING : ConnectionStatus()
    data object SUCCESS : ConnectionStatus()
    data class ERROR(val message: String) : ConnectionStatus()
}

private fun roleLabel(role: String?): String {
    return when (role) {
        "admin" -> "Администратор"
        "dispatcher" -> "Диспетчер"
        "worker" -> "Работник"
        else -> ""
    }
}

private fun buildServerEndpointPreview(serverUrl: String, serverPort: String): String {
    val baseUrl = serverUrl.trim().removeSuffix("/")
    if (baseUrl.isBlank()) {
        return "Сервер не задан"
    }

    val port = serverPort.toIntOrNull() ?: 8001
    val urlWithoutScheme = baseUrl.substringAfter("://", baseUrl)
    return when {
        urlWithoutScheme.contains(":") -> baseUrl
        baseUrl.startsWith("https://") -> baseUrl
        else -> "$baseUrl:$port"
    }
}

