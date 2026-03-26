package com.fieldworker.ui.settings

import android.content.Context
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.AuthRepository
import kotlinx.coroutines.launch

private val SettingsSectionShape = RoundedCornerShape(28.dp)
private val SettingsInnerShape = RoundedCornerShape(22.dp)
private val SettingsRowShape = RoundedCornerShape(20.dp)

/**
 * Экран настроек приложения
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    preferences: AppPreferences,
    authRepository: AuthRepository? = null,
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
    var usePolling by remember { mutableStateOf(preferences.isPollingEnabled()) }
    var pollingInterval by remember { mutableStateOf(preferences.getPollingIntervalMinutes()) }
    var showPollingIntervalDialog by remember { mutableStateOf(false) }
    var showResetDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    
    // Настройки отчётов
    var reportTarget by remember { mutableStateOf("group") } // "group", "contact", "none"
    var reportContactPhone by remember { mutableStateOf("") }
    var isLoadingReportSettings by remember { mutableStateOf(true) }
    var isSavingReportSettings by remember { mutableStateOf(false) }
    
    // Загружаем настройки отчётов с сервера
    LaunchedEffect(authRepository) {
        if (authRepository != null) {
            authRepository.getReportSettings().onSuccess { settings ->
                reportTarget = settings.reportTarget
                reportContactPhone = settings.reportContactPhone ?: ""
            }
            isLoadingReportSettings = false
        } else {
            isLoadingReportSettings = false
        }
    }
    
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
    val serverPreview = buildServerEndpointPreview(serverUrl, serverPort)
    val syncSummary = when {
        usePolling -> "Фоновый сервис активен"
        notificationsEnabled -> "Push-уведомления активны"
        else -> "Автооповещения отключены"
    }
    
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
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            SettingsOverviewCard(
                userName = userName,
                userRole = userRole,
                appVersion = appVersion,
                appVersionCode = appVersionCode,
                serverPreview = serverPreview,
                syncSummary = syncSummary,
                connectionStatus = connectionStatus
            )

            // ==================== Настройки сервера ====================
            SettingsSection(title = "Подключение к серверу", icon = Icons.Default.Settings) {
                SettingsFieldGroup {
                    OutlinedTextField(
                        value = serverUrl,
                        onValueChange = { serverUrl = it },
                        label = { Text("URL сервера") },
                        placeholder = { Text("http://192.168.1.100") },
                        leadingIcon = { Icon(Icons.Default.Home, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )

                    OutlinedTextField(
                        value = serverPort,
                        onValueChange = { serverPort = it.filter { c -> c.isDigit() } },
                        label = { Text("Порт") },
                        placeholder = { Text("8001") },
                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                }
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Button(
                        onClick = {
                            preferences.setServerUrl(serverUrl)
                            preferences.setServerPort(serverPort.toIntOrNull() ?: 8001)
                            scope.launch {
                                snackbarHostState.showSnackbar("Настройки сохранены")
                            }
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Done, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Сохранить")
                    }
                    
                    OutlinedButton(
                        onClick = {
                            onTestConnection(buildServerEndpointPreview(serverUrl, serverPort))
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Проверить")
                    }
                }
                
                SettingsConnectionBanner(connectionStatus = connectionStatus)
            }
            
            // ==================== Отображение задач ====================
            SettingsSection(title = "Отображение", icon = Icons.AutoMirrored.Filled.List) {
                SettingsSwitch(
                    icon = Icons.Default.Done,
                    title = "Скрывать выполненные заявки",
                    subtitle = "По умолчанию не показывать заявки со статусом 'Выполнена'",
                    checked = hideDoneTasks,
                    onCheckedChange = { 
                        hideDoneTasks = it
                        preferences.setHideDoneTasks(it)
                    }
                )

                SettingsSwitch(
                    icon = Icons.Default.LocationOn,
                    title = "Моё местоположение",
                    subtitle = "Показывать текущую геопозицию на карте",
                    checked = showMyLocation,
                    onCheckedChange = { 
                        showMyLocation = it
                        preferences.setShowMyLocation(it)
                    }
                )
            }
            
            // ==================== Уведомления ====================
            SettingsSection(title = "Уведомления", icon = Icons.Default.Notifications) {
                SettingsSwitch(
                    icon = Icons.Default.Notifications,
                    title = "Push-уведомления",
                    subtitle = "Получать уведомления о задачах",
                    checked = notificationsEnabled,
                    onCheckedChange = { 
                        notificationsEnabled = it
                        preferences.setNotificationsEnabled(it)
                    }
                )
                
                if (notificationsEnabled) {
                    SettingsSwitch(
                        icon = Icons.Default.Add,
                        title = "Новые задачи",
                        subtitle = "Уведомлять о новых назначенных задачах",
                        checked = notifyNewTasks,
                        onCheckedChange = { 
                            notifyNewTasks = it
                            preferences.setNotifyNewTasks(it)
                        }
                    )

                    SettingsSwitch(
                        icon = Icons.Default.Refresh,
                        title = "Изменение статуса",
                        subtitle = "Уведомлять об изменении статуса задач",
                        checked = notifyStatusChange,
                        onCheckedChange = { 
                            notifyStatusChange = it
                            preferences.setNotifyStatusChange(it)
                        }
                    )

                    SettingsSwitch(
                        icon = Icons.Default.Email,
                        title = "Сообщения в чате",
                        subtitle = "Уведомлять о новых сообщениях в чатах",
                        checked = notifyChatMessages,
                        onCheckedChange = { 
                            notifyChatMessages = it
                            preferences.setNotifyChatMessages(it)
                        }
                    )

                    SettingsSwitch(
                        icon = Icons.Default.Refresh,
                        title = "Фоновые уведомления",
                        subtitle = "Мгновенные уведомления (для устройств без Google)",
                        checked = usePolling,
                        onCheckedChange = { 
                            usePolling = it
                            preferences.setPollingEnabled(it)
                            if (it) {
                                com.fieldworker.data.realtime.RealtimePushService.startService(context)
                            } else {
                                com.fieldworker.data.realtime.RealtimePushService.stopService(context)
                            }
                        }
                    )
                }
            }
            
            // ==================== Отчёты о выполнении ====================
            SettingsSection(title = "Отчёты о выполнении", icon = Icons.AutoMirrored.Filled.Send) {
                if (isLoadingReportSettings) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    }
                } else {
                    Text(
                        text = "Куда отправлять отчёты о выполненных заявках:",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )

                    ReportTargetCard(
                        icon = Icons.Default.Notifications,
                        title = "В рабочую группу",
                        subtitle = "Стандартный режим: отчёт отправляется в общий рабочий канал.",
                        selected = reportTarget == "group",
                        onClick = {
                            reportTarget = "group"
                            reportContactPhone = ""
                            if (authRepository != null) {
                                scope.launch {
                                    isSavingReportSettings = true
                                    authRepository.updateReportSettings("group", null)
                                        .onSuccess {
                                            snackbarHostState.showSnackbar("Настройки сохранены")
                                        }
                                        .onFailure { e ->
                                            snackbarHostState.showSnackbar("Ошибка: ${e.message}")
                                        }
                                    isSavingReportSettings = false
                                }
                            }
                        }
                    )

                    ReportTargetCard(
                        icon = Icons.Default.Phone,
                        title = "Конкретному контакту",
                        subtitle = "Личные сообщения диспетчеру.",
                        selected = reportTarget == "contact",
                        onClick = { reportTarget = "contact" }
                    )

                    ReportTargetCard(
                        icon = Icons.Default.Delete,
                        title = "Не отправлять",
                        subtitle = "Отключить автоматическую отправку отчётов.",
                        selected = reportTarget == "none",
                        onClick = {
                            reportTarget = "none"
                            reportContactPhone = ""
                            if (authRepository != null) {
                                scope.launch {
                                    isSavingReportSettings = true
                                    authRepository.updateReportSettings("none", null)
                                        .onSuccess {
                                            snackbarHostState.showSnackbar("Настройки сохранены")
                                        }
                                        .onFailure { e ->
                                            snackbarHostState.showSnackbar("Ошибка: ${e.message}")
                                        }
                                    isSavingReportSettings = false
                                }
                            }
                        }
                    )

                    if (reportTarget == "contact") {
                        SettingsFieldGroup {
                            OutlinedTextField(
                                value = reportContactPhone,
                                onValueChange = { reportContactPhone = it.filter { c -> c.isDigit() } },
                                label = { Text("Номер телефона") },
                                placeholder = { Text("79001234567") },
                                leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone)
                            )

                            Text(
                                text = "Укажите номер в формате 79001234567 без «+» и пробелов.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Button(
                                onClick = {
                                    if (authRepository != null && reportContactPhone.isNotBlank()) {
                                        scope.launch {
                                            isSavingReportSettings = true
                                            authRepository.updateReportSettings("contact", reportContactPhone)
                                                .onSuccess {
                                                    snackbarHostState.showSnackbar("Настройки сохранены")
                                                }
                                                .onFailure { e ->
                                                    snackbarHostState.showSnackbar("Ошибка: ${e.message}")
                                                }
                                            isSavingReportSettings = false
                                        }
                                    }
                                },
                                enabled = authRepository != null &&
                                    reportContactPhone.length >= 11 &&
                                    !isSavingReportSettings,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                if (isSavingReportSettings) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimary
                                    )
                                } else {
                                    Icon(Icons.Default.Done, contentDescription = null)
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Сохранить контакт")
                            }
                        }
                    }
                }
            }
            
            // ==================== Обновления ====================
            SettingsSection(title = "Обновления", icon = Icons.Default.Refresh) {
                SettingsItem(
                    icon = Icons.Default.Info,
                    title = "Текущая версия",
                    subtitle = "FieldWorker v$appVersion • код $appVersionCode"
                )

                OutlinedButton(
                    onClick = onCheckForUpdates,
                    enabled = !isCheckingForUpdates,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (isCheckingForUpdates) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Проверить обновления")
                }
            }

            // ==================== Сброс ====================
            SettingsSection(title = "Данные", icon = Icons.Default.Info) {
                SettingsItem(
                    icon = Icons.Default.Delete,
                    iconBackgroundColor = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                    iconTint = MaterialTheme.colorScheme.error,
                    title = "Сбросить настройки",
                    subtitle = "Вернуть локальные параметры приложения к значениям по умолчанию.",
                    onClick = { showResetDialog = true },
                    trailing = {
                        SettingsActionPill(
                            text = "Сброс",
                            containerColor = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                            contentColor = MaterialTheme.colorScheme.error
                        )
                    }
                )
            }
            
            // ==================== Аккаунт ====================
            SettingsSection(title = "Аккаунт", icon = Icons.Default.Person) {
                SettingsItem(
                    icon = Icons.Default.AccountCircle,
                    title = userName,
                    subtitle = if (userRole.isNotEmpty()) userRole else "Авторизованный пользователь"
                )
                
                Button(
                    onClick = onLogout,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Выйти из аккаунта")
                }
            }
            
            // Информация о версии (5 тапов = режим разработчика)
            Surface(
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .clickable {
                        versionTapCount++
                        if (versionTapCount >= 5) {
                            versionTapCount = 0
                            onOpenDeveloperScreen()
                        }
                    },
                shape = RoundedCornerShape(999.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(
                    1.dp,
                    MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f)
                )
            ) {
                Text(
                    text = buildString {
                        append("FieldWorker v$appVersion")
                        if (versionTapCount > 0) {
                            append(" • ещё ${5 - versionTapCount}")
                        }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                )
            }
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
                        usePolling = preferences.isPollingEnabled()
                        pollingInterval = preferences.getPollingIntervalMinutes()

                        if (usePolling) {
                            com.fieldworker.data.realtime.RealtimePushService.startService(context)
                        } else {
                            com.fieldworker.data.realtime.RealtimePushService.stopService(context)
                        }

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

@Composable
private fun SettingsOverviewCard(
    userName: String,
    userRole: String,
    appVersion: String,
    appVersionCode: Int,
    serverPreview: String,
    syncSummary: String,
    connectionStatus: ConnectionStatus
) {
    Surface(
        shape = SettingsSectionShape,
        color = Color.Transparent,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    brush = Brush.linearGradient(
                        listOf(
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.96f),
                            MaterialTheme.colorScheme.surface,
                            MaterialTheme.colorScheme.background
                        )
                    ),
                    shape = SettingsSectionShape
                )
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = "FIELDWORKER",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = "Устройство и рабочий профиль",
                            style = MaterialTheme.typography.titleLarge
                        )
                        Text(
                            text = "Подключение, уведомления и версия приложения в одном месте.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    SettingsStatusChip(connectionStatus = connectionStatus)
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.82f),
                        border = BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
                        )
                    ) {
                        Box(
                            modifier = Modifier.size(68.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Default.AccountCircle,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(40.dp)
                            )
                        }
                    }

                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = userName,
                            style = MaterialTheme.typography.titleLarge
                        )
                        if (userRole.isNotEmpty()) {
                            Text(
                                text = userRole,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(
                            text = "Версия $appVersion • код $appVersionCode",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    SettingsOverviewTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Settings,
                        label = "Сервер",
                        value = serverPreview
                    )
                    SettingsOverviewTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Refresh,
                        label = "Синхронизация",
                        value = syncSummary
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsOverviewTile(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    label: String,
    value: String
) {
    Surface(
        modifier = modifier,
        shape = SettingsInnerShape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@Composable
private fun SettingsStatusChip(connectionStatus: ConnectionStatus) {
    val presentation = connectionStatusPresentation(connectionStatus)

    Surface(
        shape = RoundedCornerShape(999.dp),
        color = presentation.containerColor,
        border = BorderStroke(1.dp, presentation.tint.copy(alpha = 0.22f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (connectionStatus == ConnectionStatus.TESTING) {
                CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    strokeWidth = 2.dp,
                    color = presentation.tint
                )
            } else {
                Icon(
                    presentation.icon,
                    contentDescription = null,
                    tint = presentation.tint,
                    modifier = Modifier.size(14.dp)
                )
            }
            Text(
                text = presentation.label,
                style = MaterialTheme.typography.labelLarge,
                color = presentation.tint
            )
        }
    }
}

@Composable
private fun SettingsConnectionBanner(
    connectionStatus: ConnectionStatus,
    modifier: Modifier = Modifier
) {
    val presentation = connectionStatusPresentation(connectionStatus)

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = SettingsInnerShape,
        color = presentation.containerColor,
        border = BorderStroke(1.dp, presentation.tint.copy(alpha = 0.18f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (connectionStatus == ConnectionStatus.TESTING) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = presentation.tint
                )
            } else {
                Icon(
                    presentation.icon,
                    contentDescription = null,
                    tint = presentation.tint,
                    modifier = Modifier.size(18.dp)
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = presentation.label,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = presentation.tint
                )
                Text(
                    text = presentation.detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun SettingsSection(
    title: String,
    icon: ImageVector,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        shape = SettingsSectionShape,
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .animateContentSize()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer
                ) {
                    Box(
                        modifier = Modifier.size(42.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            icon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium
                )
            }

            content()
        }
    }
}

@Composable
private fun SettingsFieldGroup(
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        shape = SettingsInnerShape,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.18f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
    }
}

@Composable
fun SettingsItem(
    icon: ImageVector,
    iconBackgroundColor: Color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.65f),
    iconTint: Color = MaterialTheme.colorScheme.primary,
    title: String,
    subtitle: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
        shape = SettingsRowShape,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.18f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(shape = CircleShape, color = iconBackgroundColor) {
                Box(
                    modifier = Modifier.size(40.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = iconTint,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            when {
                trailing != null -> trailing()
                onClick != null -> Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun SettingsSwitch(
    icon: ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    val containerColor = if (checked) {
        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.38f)
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.18f)
    }
    val borderColor = if (checked) {
        MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
    } else {
        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) },
        shape = SettingsRowShape,
        color = containerColor,
        border = BorderStroke(1.dp, borderColor)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = CircleShape,
                color = if (checked) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.surface.copy(alpha = 0.75f)
            ) {
                Box(
                    modifier = Modifier.size(40.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = if (checked) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = MaterialTheme.colorScheme.surface,
                    checkedTrackColor = MaterialTheme.colorScheme.primary,
                    uncheckedThumbColor = MaterialTheme.colorScheme.surface,
                    uncheckedTrackColor = MaterialTheme.colorScheme.outlineVariant
                )
            )
        }
    }
}

@Composable
private fun ReportTargetCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = SettingsRowShape,
        color = if (selected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.42f)
        else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.18f),
        border = BorderStroke(
            1.dp,
            if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
            else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)
        )
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = CircleShape,
                color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.surface.copy(alpha = 0.75f)
            ) {
                Box(
                    modifier = Modifier.size(40.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = if (selected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            RadioButton(
                selected = selected,
                onClick = onClick
            )
        }
    }
}

@Composable
private fun SettingsActionPill(
    text: String,
    containerColor: Color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
    contentColor: Color = MaterialTheme.colorScheme.primary
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = containerColor
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = contentColor,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
        )
    }
}

sealed class ConnectionStatus {
    data object IDLE : ConnectionStatus()
    data object TESTING : ConnectionStatus()
    data object SUCCESS : ConnectionStatus()
    data class ERROR(val message: String) : ConnectionStatus()
}

private data class ConnectionStatusPresentation(
    val label: String,
    val detail: String,
    val icon: ImageVector,
    val tint: Color,
    val containerColor: Color
)

@Composable
private fun connectionStatusPresentation(connectionStatus: ConnectionStatus): ConnectionStatusPresentation {
    return when (connectionStatus) {
        ConnectionStatus.IDLE -> ConnectionStatusPresentation(
            label = "Не проверено",
            detail = "Нажмите «Проверить», чтобы убедиться, что сервер доступен.",
            icon = Icons.Default.Info,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.18f)
        )
        ConnectionStatus.TESTING -> ConnectionStatusPresentation(
            label = "Проверяем",
            detail = "Выполняем сетевой запрос к указанному серверу.",
            icon = Icons.Default.Refresh,
            tint = MaterialTheme.colorScheme.primary,
            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)
        )
        ConnectionStatus.SUCCESS -> ConnectionStatusPresentation(
            label = "Подключено",
            detail = "Сервер отвечает, настройки сети выглядят корректно.",
            icon = Icons.Default.CheckCircle,
            tint = MaterialTheme.colorScheme.primary,
            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)
        )
        is ConnectionStatus.ERROR -> ConnectionStatusPresentation(
            label = "Ошибка подключения",
            detail = connectionStatus.message,
            icon = Icons.Default.Warning,
            tint = MaterialTheme.colorScheme.error,
            containerColor = MaterialTheme.colorScheme.error.copy(alpha = 0.10f)
        )
    }
}

private fun roleLabel(role: String?): String {
    return when (role) {
        "admin" -> "Администратор"
        "dispatcher" -> "Диспетчер"
        "worker" -> "Работник"
        else -> ""
    }
}

private fun pollingIntervalLabel(minutes: Int): String {
    return when (minutes) {
        5 -> "Каждые 5 минут"
        10 -> "Каждые 10 минут"
        15 -> "Каждые 15 минут"
        30 -> "Каждые 30 минут"
        60 -> "Каждый час"
        else -> "Каждые $minutes минут"
    }
}

private fun buildServerEndpointPreview(serverUrl: String, serverPort: String): String {
    val baseUrl = serverUrl.trim().removeSuffix("/")
    if (baseUrl.isBlank()) {
        return "Сервер не задан"
    }

    val port = serverPort.toIntOrNull() ?: 8001
    val urlWithoutScheme = baseUrl.substringAfter("://", baseUrl)
    return if (urlWithoutScheme.contains(":")) baseUrl else "$baseUrl:$port"
}

