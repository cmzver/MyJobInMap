package com.fieldworker

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.dto.FCMTokenDto
import com.fieldworker.data.notification.FCMService
import com.fieldworker.data.notification.TaskPollingWorker
import com.fieldworker.data.preferences.AppPreferences
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.osmdroid.config.Configuration as OsmConfiguration
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * Application класс с инициализацией Hilt и osmdroid.
 */
@HiltAndroidApp
class FieldWorkerApplication : Application(), Configuration.Provider {
    
    companion object {
        private const val TAG = "FieldWorkerApp"
    }
    
    @Inject
    lateinit var workerFactory: HiltWorkerFactory
    
    @Inject
    lateinit var preferences: AppPreferences
    
    @Inject
    lateinit var tasksApi: TasksApi
    
    // Конфигурация WorkManager с HiltWorkerFactory
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(android.util.Log.DEBUG)
            .build()
    
    override fun onCreate() {
        super.onCreate()
        
        // Настройка osmdroid - ОБЯЗАТЕЛЬНО установить userAgentValue
        OsmConfiguration.getInstance().apply {
            userAgentValue = packageName
            // Путь для кеша тайлов карты
            osmdroidBasePath = filesDir
            osmdroidTileCache = cacheDir
        }
        
        // Создаём каналы уведомлений
        createNotificationChannels()
        
        // Проверяем наличие Google Play Services
        if (isGooglePlayServicesAvailable()) {
            Log.d(TAG, "Google Play Services available, using FCM")
            registerFCMToken()
            
            // Если polling был включен вручную - запускаем его тоже
            if (preferences.isPollingEnabled()) {
                Log.d(TAG, "Polling is manually enabled, starting...")
                startPolling()
            }
        } else {
            Log.w(TAG, "Google Play Services NOT available, using polling")
            preferences.setPollingEnabled(true)
            startPolling()
        }
    }
    
    /**
     * Проверяет доступность Google Play Services
     */
    private fun isGooglePlayServicesAvailable(): Boolean {
        val googleApiAvailability = GoogleApiAvailability.getInstance()
        val resultCode = googleApiAvailability.isGooglePlayServicesAvailable(this)
        return resultCode == ConnectionResult.SUCCESS
    }
    
    /**
     * Создаёт каналы уведомлений (для Android 8.0+)
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Канал для новых задач с кастомным звуком
            val tasksChannel = NotificationChannel(
                FCMService.CHANNEL_ID_TASKS,
                "Новые задачи",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Уведомления о новых назначенных задачах"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300) // Двойная вибрация
                enableLights(true)
                
                // Кастомный звук уведомления (если файл существует)
                val soundResId = resources.getIdentifier("notification_task", "raw", packageName)
                if (soundResId != 0) {
                    val soundUri = Uri.parse("android.resource://$packageName/$soundResId")
                    val audioAttributes = AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build()
                    setSound(soundUri, audioAttributes)
                    Log.d(TAG, "Custom notification sound set")
                } else {
                    Log.d(TAG, "Custom sound not found, using default")
                }
            }
            
            // Канал для аварийных заявок (максимальный приоритет)
            val emergencyChannel = NotificationChannel(
                FCMService.CHANNEL_ID_EMERGENCY,
                "Аварийные заявки",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Срочные уведомления об аварийных заявках"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500) // Тройная длинная вибрация
                enableLights(true)
                lightColor = android.graphics.Color.RED
                
                // Кастомный звук для аварийных
                val soundResId = resources.getIdentifier("notification_emergency", "raw", packageName)
                if (soundResId != 0) {
                    val soundUri = Uri.parse("android.resource://$packageName/$soundResId")
                    val audioAttributes = AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build()
                    setSound(soundUri, audioAttributes)
                    Log.d(TAG, "Emergency notification sound set")
                }
            }
            
            // Канал для изменения статуса
            val statusChannel = NotificationChannel(
                FCMService.CHANNEL_ID_STATUS,
                "Изменение статуса",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Уведомления об изменении статуса задач"
            }
            
            notificationManager.createNotificationChannels(listOf(tasksChannel, emergencyChannel, statusChannel))
            Log.d(TAG, "Notification channels created")
        }
    }
    
    /**
     * Регистрирует FCM токен на сервере
     */
    private fun registerFCMToken() {
        Log.d(TAG, "Attempting to get FCM token...")
        
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.e(TAG, "❌ Failed to get FCM token", task.exception)
                // Включаем polling как fallback
                preferences.setPollingEnabled(true)
                startPolling()
                return@addOnCompleteListener
            }
            
            val token = task.result
            Log.d(TAG, "✅ FCM Token received: ${token.take(30)}...")
            
            // Сохраняем локально
            preferences.setFcmToken(token)
            
            // Отправляем на сервер
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val serverUrl = preferences.getFullServerUrl()
                    Log.d(TAG, "📡 Registering device on server: $serverUrl")
                    
                    val dto = FCMTokenDto.withDeviceInfo(token)
                    Log.d(TAG, "   Device name: ${dto.deviceName}")
                    
                    val response = tasksApi.registerDevice(dto)
                    if (response.isSuccessful) {
                        Log.d(TAG, "✅ Device registered on server successfully")
                        // FCM работает, выключаем polling
                        preferences.setPollingEnabled(false)
                        stopPolling()
                    } else {
                        Log.e(TAG, "❌ Failed to register device: ${response.code()} ${response.message()}")
                        Log.e(TAG, "   Error body: ${response.errorBody()?.string()}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Error registering device", e)
                }
            }
        }
    }
    
    /**
     * Запускает периодический polling для устройств без GMS
     */
    private fun startPolling() {
        val intervalMinutes = preferences.getPollingIntervalMinutes()
        Log.d(TAG, "Starting task polling (every $intervalMinutes minutes)")
        
        val pollingRequest = PeriodicWorkRequestBuilder<TaskPollingWorker>(
            intervalMinutes.toLong(), TimeUnit.MINUTES
        ).build()
        
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            TaskPollingWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            pollingRequest
        )
    }
    
    /**
     * Останавливает polling
     */
    private fun stopPolling() {
        Log.d(TAG, "Stopping task polling")
        WorkManager.getInstance(this).cancelUniqueWork(TaskPollingWorker.WORK_NAME)
    }
}
