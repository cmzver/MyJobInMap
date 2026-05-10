package com.fieldworker.data.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.fieldworker.ui.MainActivity
import com.fieldworker.R
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.DeviceRepository
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Firebase Cloud Messaging Service для получения push-уведомлений
 */
@AndroidEntryPoint
class FCMService : FirebaseMessagingService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Inject
    lateinit var preferences: AppPreferences

    @Inject
    lateinit var deviceRepository: DeviceRepository
    
    companion object {
        private const val TAG = "FCMService"
        const val CHANNEL_ID_TASKS = "fieldworker_tasks"
        const val CHANNEL_ID_STATUS = "fieldworker_status"
        const val CHANNEL_ID_EMERGENCY = "fieldworker_emergency"
        const val CHANNEL_ID_CHAT = "fieldworker_chat"
        const val NOTIFICATION_ID_NEW_TASK = 1001
        const val NOTIFICATION_ID_STATUS_CHANGE = 1002
        const val NOTIFICATION_ID_EMERGENCY = 1003
        const val NOTIFICATION_ID_CHAT = 1004
    }
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }
    
    /**
     * Вызывается при получении нового FCM токена
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token: $token")
        
        // Сохраняем токен локально
        preferences.setFcmToken(token)

        if (preferences.isLoggedIn()) {
            serviceScope.launch {
                deviceRepository.registerDevice().onFailure {
                    Log.e(TAG, "Failed to register rotated FCM token", it)
                }
            }
        }
    }
    
    /**
     * Вызывается при получении push-уведомления
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        
        Log.d(TAG, "Message received from: ${remoteMessage.from}")
        
        // Проверяем включены ли уведомления
        if (!preferences.getNotificationsEnabled()) {
            Log.d(TAG, "Notifications disabled, ignoring message")
            return
        }
        
        // Обрабатываем data payload
        remoteMessage.data.let { data ->
            val type = data["type"] ?: "general"
            val title = data["title"] ?: remoteMessage.notification?.title ?: "FieldWorker"
            val body = data["body"] ?: remoteMessage.notification?.body ?: ""
            val taskId = data["task_id"]
            val messageId = data["message_id"]
            
            when (type) {
                "new_task", "task_assigned", "task_created" -> {
                    if (preferences.getNotifyNewTasks()) {
                        showNewTaskNotification(title, body, taskId)
                    }
                }
                "status_change" -> {
                    if (preferences.getNotifyStatusChange()) {
                        showStatusChangeNotification(title, body, taskId)
                    }
                }
                "chat", "chat_message" -> {
                    if (preferences.getNotifyChatMessages()) {
                        val chatId = data["chat_id"] ?: data["conversation_id"]
                        showChatNotification(title, body, chatId, messageId)
                    }
                }
                else -> {
                    showGeneralNotification(title, body)
                }
            }
        }
    }
    
    /**
     * Создаёт каналы уведомлений (для Android 8.0+)
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build()
            
            // Канал для новых задач
            val tasksChannel = NotificationChannel(
                CHANNEL_ID_TASKS,
                "Новые задачи",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Уведомления о новых назначенных задачах"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300)
                enableLights(true)
                setSound(defaultSoundUri, audioAttributes)
            }

            // Канал для аварийных заявок
            val emergencyChannel = NotificationChannel(
                CHANNEL_ID_EMERGENCY,
                "Аварийные заявки",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Срочные уведомления об аварийных заявках"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500)
                enableLights(true)
                setSound(defaultSoundUri, audioAttributes)
            }
            
            // Канал для изменения статуса
            val statusChannel = NotificationChannel(
                CHANNEL_ID_STATUS,
                "Изменение статуса",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Уведомления об изменении статуса задач"
                setSound(defaultSoundUri, audioAttributes)
            }

            // Канал для чата
            val chatChannel = NotificationChannel(
                CHANNEL_ID_CHAT,
                "Сообщения в чате",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Уведомления о новых сообщениях в чатах"
                enableVibration(true)
                enableLights(true)
                setSound(defaultSoundUri, audioAttributes)
            }
            
            notificationManager.createNotificationChannels(
                listOf(tasksChannel, emergencyChannel, statusChannel, chatChannel)
            )
        }
    }
    
    private fun showNewTaskNotification(title: String, body: String, taskId: String?) {
        showNotification(
            channelId = CHANNEL_ID_TASKS,
            title = title,
            body = body,
            id = taskId?.hashCode() ?: NOTIFICATION_ID_NEW_TASK,
            priority = NotificationCompat.PRIORITY_HIGH,
            withBigText = true,
            taskId = taskId
        )
    }

    private fun showStatusChangeNotification(title: String, body: String, taskId: String?) {
        showNotification(
            channelId = CHANNEL_ID_STATUS,
            title = title,
            body = body,
            id = taskId?.hashCode() ?: NOTIFICATION_ID_STATUS_CHANGE,
            priority = NotificationCompat.PRIORITY_DEFAULT,
            taskId = taskId
        )
    }

    private fun showChatNotification(title: String, body: String, chatId: String?, messageId: String? = null) {
        showNotification(
            channelId = CHANNEL_ID_CHAT,
            title = title,
            body = body,
            id = chatId?.hashCode() ?: NOTIFICATION_ID_CHAT,
            priority = NotificationCompat.PRIORITY_HIGH,
            withBigText = true,
            chatId = chatId,
            chatMessageId = messageId
        )
    }

    private fun showGeneralNotification(title: String, body: String) {
        showNotification(
            channelId = CHANNEL_ID_TASKS,
            title = title,
            body = body,
            id = (System.currentTimeMillis() % Int.MAX_VALUE).toInt(),
            priority = NotificationCompat.PRIORITY_HIGH
        )
    }

    private fun showNotification(
        channelId: String,
        title: String,
        body: String,
        id: Int,
        priority: Int = NotificationCompat.PRIORITY_HIGH,
        withBigText: Boolean = false,
        taskId: String? = null,
        chatId: String? = null,
        chatMessageId: String? = null,
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            taskId?.let { putExtra(MainActivity.EXTRA_TASK_ID, it) }
            chatId?.let { putExtra(MainActivity.EXTRA_CHAT_ID, it) }
            chatMessageId?.let { putExtra(MainActivity.EXTRA_CHAT_MESSAGE_ID, it) }
        }
        val pendingIntent = PendingIntent.getActivity(
            this, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(priority)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(defaultSoundUri)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
        if (withBigText) {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
            builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
        }
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(id, builder.build())
    }
}
