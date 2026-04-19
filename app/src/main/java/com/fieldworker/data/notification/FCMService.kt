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
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Firebase Cloud Messaging Service для получения push-уведомлений
 */
@AndroidEntryPoint
class FCMService : FirebaseMessagingService() {
    
    @Inject
    lateinit var preferences: AppPreferences
    
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
    
    /**
     * Вызывается при получении нового FCM токена
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token: $token")
        
        // Сохраняем токен локально
        preferences.setFcmToken(token)
        
        // TODO: Отправить токен на сервер для регистрации устройства
        // Это нужно сделать когда пользователь авторизован
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
                        showChatNotification(title, body, chatId)
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
    
    /**
     * Показывает уведомление о новой задаче
     */
    private fun showNewTaskNotification(
        title: String,
        body: String,
        taskId: String?
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            taskId?.let { putExtra(MainActivity.EXTRA_TASK_ID, it) }
        }

        val requestCode = taskId?.hashCode() ?: NOTIFICATION_ID_NEW_TASK
        
        val pendingIntent = PendingIntent.getActivity(
            this, 
            requestCode, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val notification = NotificationCompat.Builder(this, CHANNEL_ID_TASKS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(defaultSoundUri)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(
            taskId?.hashCode() ?: NOTIFICATION_ID_NEW_TASK,
            notification
        )
    }
    
    /**
     * Показывает уведомление об изменении статуса
     */
    private fun showStatusChangeNotification(
        title: String,
        body: String,
        taskId: String?
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            taskId?.let { putExtra(MainActivity.EXTRA_TASK_ID, it) }
        }

        val requestCode = taskId?.hashCode() ?: NOTIFICATION_ID_STATUS_CHANGE
        
        val pendingIntent = PendingIntent.getActivity(
            this, 
            requestCode, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val notification = NotificationCompat.Builder(this, CHANNEL_ID_STATUS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(defaultSoundUri)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(
            taskId?.hashCode() ?: NOTIFICATION_ID_STATUS_CHANGE,
            notification
        )
    }
    
    /**
     * Показывает уведомление о сообщении в чате
     */
    private fun showChatNotification(
        title: String,
        body: String,
        chatId: String?
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            chatId?.let { putExtra(MainActivity.EXTRA_CHAT_ID, it) }
        }

        val requestCode = chatId?.hashCode() ?: NOTIFICATION_ID_CHAT
        
        val pendingIntent = PendingIntent.getActivity(
            this, 
            requestCode, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val notification = NotificationCompat.Builder(this, CHANNEL_ID_CHAT)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(defaultSoundUri)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(
            chatId?.hashCode() ?: NOTIFICATION_ID_CHAT,
            notification
        )
    }
    
    /**
     * Показывает общее уведомление
     */
    private fun showGeneralNotification(
        title: String,
        body: String
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(this, CHANNEL_ID_TASKS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
