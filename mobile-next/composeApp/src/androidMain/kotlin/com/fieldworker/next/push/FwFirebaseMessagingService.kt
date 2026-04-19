package com.fieldworker.next.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class FwFirebaseMessagingService : FirebaseMessagingService() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onNewToken(token: String) {
        // Token refresh will be picked up on next app launch
        // via DeviceRegistrar.registerDevice()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = data["title"] ?: "FieldWorker"
        val body = data["body"] ?: return
        val type = data["type"] ?: "general"

        val channelId = when (type) {
            "new_task", "task_assigned", "task_created" -> CHANNEL_TASKS
            "status_change" -> CHANNEL_STATUS
            "chat", "chat_message" -> CHANNEL_CHAT
            "alert", "emergency" -> CHANNEL_EMERGENCY
            else -> CHANNEL_TASKS
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(message.messageId.hashCode(), notification)
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channels = listOf(
                NotificationChannel(CHANNEL_TASKS, "Заявки", NotificationManager.IMPORTANCE_HIGH),
                NotificationChannel(CHANNEL_STATUS, "Статусы", NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(CHANNEL_CHAT, "Чат", NotificationManager.IMPORTANCE_HIGH),
                NotificationChannel(CHANNEL_EMERGENCY, "Аварийные", NotificationManager.IMPORTANCE_HIGH),
            )
            channels.forEach { manager.createNotificationChannel(it) }
        }
    }

    companion object {
        private const val CHANNEL_TASKS = "fieldworker_tasks"
        private const val CHANNEL_STATUS = "fieldworker_status"
        private const val CHANNEL_CHAT = "fieldworker_chat"
        private const val CHANNEL_EMERGENCY = "fieldworker_emergency"
    }
}
