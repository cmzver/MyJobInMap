package com.fieldworker.ui.settings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.domain.model.AccessLevel
import com.fieldworker.ui.theme.AppShape
import com.fieldworker.ui.utils.avatarInitials
import com.fieldworker.ui.utils.resolveAvatarUrl
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
    onOpenUserSettings: () -> Unit = {},
    baseUrl: String? = null,
    authToken: String? = null,
    onLogout: () -> Unit = {},
    onOpenMenu: (() -> Unit)? = null
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
    var showServerDialog by remember { mutableStateOf(false) }
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
    // Предпочитаем серверный role_label (поддерживает кастомные группы),
    // иначе — встроенная роль, иначе — базовый уровень доступа.
    val userRole = preferences.getUserRoleLabel()?.takeIf { it.isNotBlank() }
        ?: AccessLevel.builtinLabel(preferences.getUserRole())
        ?: AccessLevel.resolve(preferences.getUserRole(), preferences.getBaseAccess()).displayName
    
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Настройки") },
                navigationIcon = {
                    if (onOpenMenu != null) {
                        IconButton(onClick = onOpenMenu) {
                            Icon(Icons.Default.Menu, contentDescription = "Меню")
                        }
                    }
                },
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
                .padding(horizontal = 16.dp)
        ) {
            // === Профиль ===
            val avatarUrl = preferences.getUserAvatarUrl()
            SettingsGroup(modifier = Modifier.padding(top = 8.dp)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onOpenUserSettings)
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    ProfileAvatar(
                        avatarUrl = avatarUrl,
                        fullName = userName,
                        baseUrl = baseUrl,
                        authToken = authToken,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = userName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = if (userRole.isNotEmpty()) userRole else "Пользователь",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Icon(
                        Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // === Отображение ===
            SectionLabel("Отображение")
            SettingsGroup {
                SwitchRow(
                    icon = Icons.Default.CheckCircle,
                    title = "Скрывать завершённые",
                    subtitle = "Выполненные и отменённые заявки",
                    checked = hideDoneTasks,
                    onCheckedChange = { hideDoneTasks = it; preferences.setHideDoneTasks(it) }
                )
                GroupDivider()
                SwitchRow(
                    icon = Icons.Default.LocationOn,
                    title = "Моё местоположение",
                    subtitle = "Показывать на карте",
                    checked = showMyLocation,
                    onCheckedChange = { showMyLocation = it; preferences.setShowMyLocation(it) }
                )
            }

            // === Уведомления ===
            SectionLabel("Уведомления")
            SettingsGroup {
                SwitchRow(
                    icon = Icons.Default.Notifications,
                    title = "Push-уведомления",
                    checked = notificationsEnabled,
                    onCheckedChange = { notificationsEnabled = it; preferences.setNotificationsEnabled(it) }
                )
                // Подробности — только когда push включены; раскрываются плавно
                AnimatedVisibility(visible = notificationsEnabled) {
                    Column {
                        GroupDivider()
                        SwitchRow(
                            title = "Новые заявки",
                            checked = notifyNewTasks,
                            onCheckedChange = { notifyNewTasks = it; preferences.setNotifyNewTasks(it) }
                        )
                        GroupDivider()
                        SwitchRow(
                            title = "Смена статуса",
                            checked = notifyStatusChange,
                            onCheckedChange = { notifyStatusChange = it; preferences.setNotifyStatusChange(it) }
                        )
                        GroupDivider()
                        SwitchRow(
                            title = "Сообщения в чате",
                            checked = notifyChatMessages,
                            onCheckedChange = { notifyChatMessages = it; preferences.setNotifyChatMessages(it) }
                        )
                    }
                }
            }

            // === Подключение === (адрес сервера меняют редко — одна строка, поля в диалоге)
            SectionLabel("Подключение")
            SettingsGroup {
                NavRow(
                    icon = Icons.Default.Settings,
                    title = "Сервер",
                    value = buildServerEndpointPreview(serverUrl, serverPort)
                        .removePrefix("https://").removePrefix("http://"),
                    onClick = { showServerDialog = true }
                )
            }

            // === Приложение ===
            SectionLabel("Приложение")
            SettingsGroup {
                NavRow(
                    icon = Icons.Default.Refresh,
                    title = "Проверить обновления",
                    value = "v$appVersion",
                    isLoading = isCheckingForUpdates,
                    onClick = { if (!isCheckingForUpdates) onCheckForUpdates() }
                )
                GroupDivider()
                NavRow(
                    icon = Icons.Default.Build,
                    title = "Сбросить настройки",
                    onClick = { showResetDialog = true }
                )
            }

            SettingsGroup(modifier = Modifier.padding(top = 24.dp)) {
                Text(
                    text = "Выйти из аккаунта",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onLogout)
                        .padding(vertical = 16.dp)
                )
            }

            // Версия (5 тапов = режим разработчика)
            Text(
                text = buildString {
                    append("FieldWorker v$appVersion · сборка $appVersionCode")
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

    if (showServerDialog) {
        AlertDialog(
            onDismissRequest = { showServerDialog = false },
            title = { Text("Сервер") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                    if (connectionStatus != ConnectionStatus.IDLE) {
                        val (statusText, statusColor) = when (connectionStatus) {
                            ConnectionStatus.TESTING -> "Проверяем..." to MaterialTheme.colorScheme.onSurfaceVariant
                            ConnectionStatus.SUCCESS -> "Сервер доступен" to MaterialTheme.colorScheme.primary
                            is ConnectionStatus.ERROR -> connectionStatus.message to MaterialTheme.colorScheme.error
                            else -> "" to MaterialTheme.colorScheme.onSurfaceVariant
                        }
                        Text(text = statusText, style = MaterialTheme.typography.bodySmall, color = statusColor)
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        preferences.setServerUrl(serverUrl)
                        preferences.setServerPort(serverPort.toIntOrNull() ?: 8001)
                        showServerDialog = false
                        scope.launch { snackbarHostState.showSnackbar("Сохранено") }
                    }
                ) { Text("Сохранить") }
            },
            dismissButton = {
                TextButton(
                    onClick = { onTestConnection(buildServerEndpointPreview(serverUrl, serverPort)) }
                ) { Text("Проверить") }
            }
        )
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
    // Нейтральный eyebrow, как в портале: акцент — только для действий
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.8.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 16.dp, top = 24.dp, bottom = 8.dp)
    )
}

/** Сгруппированная карточка настроек (iOS-style inset group). */
@Composable
private fun SettingsGroup(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = AppShape.lg,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
    ) {
        Column(content = content)
    }
}

/** Разделитель внутри группы — с отступом под иконку, как в iOS. */
@Composable
private fun GroupDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(start = 60.dp),
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
    )
}

/** Иконка в мягкой плашке слева от строки (или пустое место той же ширины). */
@Composable
private fun RowIcon(icon: ImageVector?) {
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(AppShape.sm)
            .background(if (icon != null) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else Color.Transparent),
        contentAlignment = Alignment.Center
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun SwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    icon: ImageVector? = null,
    subtitle: String? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        RowIcon(icon)
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
private fun NavRow(
    icon: ImageVector?,
    title: String,
    onClick: () -> Unit,
    value: String? = null,
    isLoading: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        RowIcon(icon)
        Text(text = title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        if (isLoading) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        } else if (value != null) {
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 160.dp)
            )
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
        )
    }
}

sealed class ConnectionStatus {
    data object IDLE : ConnectionStatus()
    data object TESTING : ConnectionStatus()
    data object SUCCESS : ConnectionStatus()
    data class ERROR(val message: String) : ConnectionStatus()
}

@Composable
private fun ProfileAvatar(
    avatarUrl: String?,
    fullName: String,
    baseUrl: String?,
    authToken: String?,
) {
    val context = LocalContext.current
    val resolved = remember(avatarUrl, baseUrl) { resolveAvatarUrl(avatarUrl, baseUrl) }
    // Bearer-токен подставляет AuthHeaderInterceptor в общем Coil ImageLoader.
    val request = remember(resolved) {
        resolved?.let { url ->
            ImageRequest.Builder(context)
                .data(url)
                .crossfade(false)
                .build()
        }
    }
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .border(1.dp, MaterialTheme.colorScheme.surface, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (request != null) {
            AsyncImage(
                model = request,
                contentDescription = "Аватар",
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        } else {
            val initials = avatarInitials(fullName)
            if (initials.isNotEmpty()) {
                Text(
                    text = initials,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp,
                )
            } else {
                Icon(
                    Icons.Default.AccountCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(28.dp),
                )
            }
        }
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

