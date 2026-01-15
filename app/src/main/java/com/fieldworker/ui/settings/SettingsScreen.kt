package com.fieldworker.ui.settings

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.AuthRepository

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
    val appVersion = remember {
        try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Настройки") }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ==================== Настройки сервера ====================
            SettingsSection(title = "Подключение к серверу", icon = Icons.Default.Settings) {
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("URL сервера") },
                    placeholder = { Text("http://192.168.1.100") },
                    leadingIcon = { Icon(Icons.Default.Home, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
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
                
                Spacer(modifier = Modifier.height(12.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
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
                            // Убираем trailing slash и добавляем порт
                            val baseUrl = serverUrl.trimEnd('/')
                            val port = serverPort.toIntOrNull() ?: 8001
                            // Проверяем, есть ли уже порт в URL (после хоста)
                            val urlWithoutScheme = baseUrl.substringAfter("://")
                            val fullUrl = if (urlWithoutScheme.contains(":")) {
                                baseUrl
                            } else {
                                "$baseUrl:$port"
                            }
                            onTestConnection(fullUrl)
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Тест")
                    }
                }
                
                // Статус подключения
                when (connectionStatus) {
                    ConnectionStatus.IDLE -> {}
                    ConnectionStatus.TESTING -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(top = 8.dp)
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Проверка подключения...", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    ConnectionStatus.SUCCESS -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(top = 8.dp)
                        ) {
                            Icon(
                                Icons.Default.CheckCircle, 
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "Подключение успешно!", 
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    is ConnectionStatus.ERROR -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(top = 8.dp)
                        ) {
                            Icon(
                                Icons.Default.Warning, 
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                connectionStatus.message, 
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }
            
            HorizontalDivider()
            
            // ==================== Отображение задач ====================
            SettingsSection(title = "Отображение", icon = Icons.AutoMirrored.Filled.List) {
                SettingsSwitch(
                    title = "Скрывать выполненные заявки",
                    subtitle = "По умолчанию не показывать заявки со статусом 'Выполнена'",
                    checked = hideDoneTasks,
                    onCheckedChange = { 
                        hideDoneTasks = it
                        preferences.setHideDoneTasks(it)
                    }
                )
                
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                
                SettingsSwitch(
                    title = "Моё местоположение",
                    subtitle = "Показывать текущую геопозицию на карте",
                    checked = showMyLocation,
                    onCheckedChange = { 
                        showMyLocation = it
                        preferences.setShowMyLocation(it)
                    }
                )
            }
            
            HorizontalDivider()
            
            // ==================== Уведомления ====================
            SettingsSection(title = "Уведомления", icon = Icons.Default.Notifications) {
                SettingsSwitch(
                    title = "Push-уведомления",
                    subtitle = "Получать уведомления о задачах",
                    checked = notificationsEnabled,
                    onCheckedChange = { 
                        notificationsEnabled = it
                        preferences.setNotificationsEnabled(it)
                    }
                )
                
                if (notificationsEnabled) {
                    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                    
                    SettingsSwitch(
                        title = "Новые задачи",
                        subtitle = "Уведомлять о новых назначенных задачах",
                        checked = notifyNewTasks,
                        onCheckedChange = { 
                            notifyNewTasks = it
                            preferences.setNotifyNewTasks(it)
                        }
                    )
                    
                    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                    
                    SettingsSwitch(
                        title = "Изменение статуса",
                        subtitle = "Уведомлять об изменении статуса задач",
                        checked = notifyStatusChange,
                        onCheckedChange = { 
                            notifyStatusChange = it
                            preferences.setNotifyStatusChange(it)
                        }
                    )
                    
                    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                    
                    SettingsSwitch(
                        title = "Режим polling",
                        subtitle = "Проверять задачи каждые $pollingInterval мин (для устройств без Google)",
                        checked = usePolling,
                        onCheckedChange = { 
                            usePolling = it
                            preferences.setPollingEnabled(it)
                            // Запускаем/останавливаем polling
                            if (it) {
                                val request = androidx.work.PeriodicWorkRequestBuilder<com.fieldworker.data.notification.TaskPollingWorker>(
                                    pollingInterval.toLong(), java.util.concurrent.TimeUnit.MINUTES
                                ).build()
                                androidx.work.WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                                    com.fieldworker.data.notification.TaskPollingWorker.WORK_NAME,
                                    androidx.work.ExistingPeriodicWorkPolicy.UPDATE,
                                    request
                                )
                            } else {
                                androidx.work.WorkManager.getInstance(context)
                                    .cancelUniqueWork(com.fieldworker.data.notification.TaskPollingWorker.WORK_NAME)
                            }
                        }
                    )
                    
                    if (usePolling) {
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        // Выбор интервала
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Интервал проверки",
                                    style = MaterialTheme.typography.bodyLarge
                                )
                                Text(
                                    text = "Каждые $pollingInterval минут",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            OutlinedButton(
                                onClick = { showPollingIntervalDialog = true }
                            ) {
                                Text("Изменить")
                            }
                        }
                    }
                }
            }
            
            HorizontalDivider()
            
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
                    
                    // Радио-кнопки для выбора получателя
                    Column {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { reportTarget = "contact" }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = reportTarget == "contact",
                                onClick = null
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text("Конкретному контакту", style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    "Личные сообщения диспетчеру",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { 
                                    reportTarget = "none"
                                    if (authRepository != null) {
                                        scope.launch {
                                            isSavingReportSettings = true
                                            authRepository.updateReportSettings("none", null)
                                            isSavingReportSettings = false
                                        }
                                    }
                                }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = reportTarget == "none",
                                onClick = null
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text("Не отправлять", style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    "Отчёты не отправляются автоматически",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                    
                    // Поле ввода номера телефона (если выбран контакт)
                    if (reportTarget == "contact") {
                        Spacer(modifier = Modifier.height(12.dp))
                        
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
                        
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        Text(
                            text = "Укажите номер в формате 79001234567 (без + и пробелов)",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        
                        Spacer(modifier = Modifier.height(12.dp))
                        
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
                            enabled = reportContactPhone.length >= 11 && !isSavingReportSettings,
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
                            Text("Сохранить")
                        }
                    }
                }
            }
            
            HorizontalDivider()
            
            // ==================== Сброс ====================
            SettingsSection(title = "Данные", icon = Icons.Default.Info) {
                OutlinedButton(
                    onClick = { showResetDialog = true },
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Сбросить настройки")
                }
            }
            
            HorizontalDivider()
            
            // ==================== Аккаунт ====================
            SettingsSection(title = "Аккаунт", icon = Icons.Default.Person) {
                // Информация о текущем пользователе
                val userName = preferences.getUserFullName() ?: preferences.getUsername() ?: "Пользователь"
                val userRole = when(preferences.getUserRole()) {
                    "admin" -> "Администратор"
                    "worker" -> "Работник"
                    else -> ""
                }
                
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.AccountCircle,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = userName,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium
                        )
                        if (userRole.isNotEmpty()) {
                            Text(
                                text = userRole,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
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
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = "FieldWorker v$appVersion" + if (versionTapCount > 0) " (${5 - versionTapCount})" else "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .clickable {
                        versionTapCount++
                        if (versionTapCount >= 5) {
                            versionTapCount = 0
                            onOpenDeveloperScreen()
                        }
                    }
                    .padding(8.dp)
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
                        pollingInterval = preferences.getPollingIntervalMinutes()
                        showResetDialog = false
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
    
    // Диалог выбора интервала polling
    if (showPollingIntervalDialog) {
        AlertDialog(
            onDismissRequest = { showPollingIntervalDialog = false },
            title = { Text("Интервал проверки") },
            text = {
                Column {
                    Text(
                        "Выберите как часто проверять новые задачи:",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                    
                    AppPreferences.POLLING_INTERVALS.forEach { minutes ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = pollingInterval == minutes,
                                onClick = {
                                    pollingInterval = minutes
                                    preferences.setPollingIntervalMinutes(minutes)
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = when (minutes) {
                                    5 -> "Каждые 5 минут"
                                    10 -> "Каждые 10 минут"
                                    15 -> "Каждые 15 минут"
                                    30 -> "Каждые 30 минут"
                                    60 -> "Каждый час"
                                    else -> "Каждые $minutes мин"
                                },
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { 
                        showPollingIntervalDialog = false
                        // Перезапускаем WorkManager с новым интервалом
                        if (usePolling) {
                            val pollingRequest = androidx.work.PeriodicWorkRequestBuilder<com.fieldworker.data.notification.TaskPollingWorker>(
                                pollingInterval.toLong(), java.util.concurrent.TimeUnit.MINUTES
                            ).build()
                            
                            androidx.work.WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                                com.fieldworker.data.notification.TaskPollingWorker.WORK_NAME,
                                androidx.work.ExistingPeriodicWorkPolicy.UPDATE,
                                pollingRequest
                            )
                            
                            scope.launch {
                                snackbarHostState.showSnackbar("Интервал изменён на $pollingInterval мин")
                            }
                        }
                    }
                ) {
                    Text("Готово")
                }
            }
        )
    }
}

/**
 * Заголовок секции в стиле референса
 */
@Composable
fun SettingsSectionHeader(
    title: String
) {
    Text(
        text = title.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(start = 16.dp, top = 24.dp, bottom = 8.dp)
    )
}

/**
 * Секция настроек (карточка с содержимым)
 */
@Composable
fun SettingsSection(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable ColumnScope.() -> Unit
) {
    Column {
        // Заголовок секции
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        
        // Карточка с содержимым
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                content()
            }
        }
    }
}

/**
 * Элемент настройки с иконкой в круге (как в референсе)
 */
@Composable
fun SettingsItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconBackgroundColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.surfaceVariant,
    iconTint: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurfaceVariant,
    title: String,
    subtitle: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (onClick != null) Modifier.clickable { onClick() } else Modifier
            )
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Иконка в круге
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .size(40.dp)
                .background(iconBackgroundColor, shape = androidx.compose.foundation.shape.CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(20.dp)
            )
        }
        
        Spacer(modifier = Modifier.width(12.dp))
        
        // Текст
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        
        // Trailing элемент (стрелка, switch и т.д.)
        if (trailing != null) {
            trailing()
        } else if (onClick != null) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Переключатель в современном стиле
 */
@Composable
fun SettingsSwitch(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Иконка в круге (опционально)
        if (icon != null) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant,
                        shape = androidx.compose.foundation.shape.CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
        }
        
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
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
                checkedTrackColor = MaterialTheme.colorScheme.primary
            )
        )
    }
}

sealed class ConnectionStatus {
    data object IDLE : ConnectionStatus()
    data object TESTING : ConnectionStatus()
    data object SUCCESS : ConnectionStatus()
    data class ERROR(val message: String) : ConnectionStatus()
}

/**
 * Проверяет, включена ли служба прослушивания уведомлений для этого приложения
 */
private fun isNotificationServiceEnabled(context: android.content.Context): Boolean {
    val enabledListeners = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
    )
    val packageName = context.packageName
    return enabledListeners?.contains(packageName) == true
}
