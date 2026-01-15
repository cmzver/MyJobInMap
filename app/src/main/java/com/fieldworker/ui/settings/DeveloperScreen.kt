package com.fieldworker.ui.settings

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.fieldworker.R
import com.fieldworker.data.notification.FCMService
import com.fieldworker.data.notification.TaskPollingWorker
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.ui.MainActivity
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

/**
 * Экран для разработчиков с отладочными функциями
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeveloperScreen(
    preferences: AppPreferences,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    
    var lastCheckedId by remember { mutableStateOf(preferences.getLastCheckedTaskId()) }
    var pollingEnabled by remember { mutableStateOf(preferences.isPollingEnabled()) }
    var pollingInterval by remember { mutableStateOf(preferences.getPollingIntervalMinutes()) }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Для разработчиков") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                }
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
            // ==================== Информация ====================
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Информация о среде",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    InfoRow("Сервер", preferences.getFullServerUrl())
                    InfoRow("FCM токен", preferences.getFcmToken()?.take(30)?.plus("...") ?: "Нет")
                    InfoRow("Polling включен", if (pollingEnabled) "Да" else "Нет")
                    InfoRow("Интервал polling", "$pollingInterval мин")
                    InfoRow("Last checked ID", lastCheckedId.toString())
                }
            }
            
            // ==================== Тест уведомлений ====================
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Тестирование уведомлений",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    
                    Button(
                        onClick = {
                            showTestNotification(context)
                            scope.launch {
                                snackbarHostState.showSnackbar("Тестовое уведомление отправлено")
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Notifications, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Показать тестовое уведомление")
                    }
                }
            }
            
            // ==================== Polling ====================
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Polling (проверка задач)",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                preferences.setLastCheckedTaskId(0)
                                lastCheckedId = 0
                                scope.launch {
                                    snackbarHostState.showSnackbar("Счётчик сброшен на 0")
                                }
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.Clear, contentDescription = null)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Сброс ID")
                        }
                        
                        Button(
                            onClick = {
                                OneTimeWorkRequestBuilder<TaskPollingWorker>()
                                    .build()
                                    .let { request ->
                                        WorkManager.getInstance(context).enqueue(request)
                                    }
                                scope.launch {
                                    snackbarHostState.showSnackbar("Polling запущен, смотрите Logcat")
                                }
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Запустить")
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    // Управление периодическим polling
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                WorkManager.getInstance(context)
                                    .cancelUniqueWork(TaskPollingWorker.WORK_NAME)
                                preferences.setPollingEnabled(false)
                                pollingEnabled = false
                                scope.launch {
                                    snackbarHostState.showSnackbar("Периодический polling остановлен")
                                }
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Text("Остановить")
                        }
                        
                        Button(
                            onClick = {
                                val request = PeriodicWorkRequestBuilder<TaskPollingWorker>(
                                    pollingInterval.toLong(), TimeUnit.MINUTES
                                ).build()
                                
                                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                                    TaskPollingWorker.WORK_NAME,
                                    ExistingPeriodicWorkPolicy.UPDATE,
                                    request
                                )
                                preferences.setPollingEnabled(true)
                                pollingEnabled = true
                                scope.launch {
                                    snackbarHostState.showSnackbar("Polling запущен каждые $pollingInterval мин")
                                }
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Запустить периодически")
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    Text(
                        "Last Checked ID: $lastCheckedId",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            
            // ==================== Интервалы ====================
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Интервал polling",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AppPreferences.POLLING_INTERVALS.forEach { minutes ->
                            FilterChip(
                                selected = pollingInterval == minutes,
                                onClick = {
                                    pollingInterval = minutes
                                    preferences.setPollingIntervalMinutes(minutes)
                                },
                                label = { 
                                    Text(
                                        if (minutes >= 60) "${minutes/60}ч" else "${minutes}м"
                                    ) 
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
            
            // ==================== Сброс ====================
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Опасная зона",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    
                    OutlinedButton(
                        onClick = {
                            preferences.resetToDefaults()
                            lastCheckedId = 0
                            pollingEnabled = false
                            pollingInterval = AppPreferences.DEFAULT_POLLING_INTERVAL
                            scope.launch {
                                snackbarHostState.showSnackbar("Все настройки сброшены")
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Сбросить все настройки")
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace
        )
    }
}

private fun showTestNotification(context: Context) {
    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    
    val intent = Intent(context, MainActivity::class.java)
    val pendingIntent = PendingIntent.getActivity(
        context, 0, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    
    val notification = NotificationCompat.Builder(context, FCMService.CHANNEL_ID_TASKS)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle("Тестовое уведомление")
        .setContentText("Если вы видите это - уведомления работают! 🎉")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .setContentIntent(pendingIntent)
        .build()
    
    notificationManager.notify(9999, notification)
}
