package com.fieldworker.data.realtime

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.fieldworker.R
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.ui.MainActivity
import com.fieldworker.data.notification.FCMService
import com.google.gson.Gson
import com.google.gson.JsonObject
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import javax.inject.Inject
import javax.inject.Named

@AndroidEntryPoint
class RealtimePushService : Service() {

    @Inject
    @Named("websocket")
    lateinit var webSocketClient: OkHttpClient

    @Inject
    lateinit var preferences: AppPreferences

    private val gson = Gson()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null

    companion object {
        private const val TAG = "RealtimePushService"
        private const val CHANNEL_ID = "realtime_push_service"
        private const val NOTIFICATION_ID = 4001
        
        fun startService(context: Context) {
            val intent = Intent(context, RealtimePushService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stopService(context: Context) {
            val intent = Intent(context, RealtimePushService::class.java)
            context.stopService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("FieldWorker")
            .setContentText("Активен")
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build()
            
        startForeground(NOTIFICATION_ID, notification)
        connect()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!preferences.isPollingEnabled()) {
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        reconnectJob?.cancel()
        webSocket?.close(1000, "Service destroyed")
        webSocket = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun connect() {
        if (webSocket != null) return

        val token = preferences.getAuthToken()
        val baseUrlString = preferences.getFullServerUrl()
        if (token.isNullOrBlank() || baseUrlString.isNullOrBlank()) {
            stopSelf()
            return
        }

        val uri = Uri.parse(baseUrlString)
        val wsScheme = if (uri.scheme == "https") "wss" else "ws"
        val url = uri.buildUpon()
            .scheme(wsScheme)
            .path("/ws")
            .clearQuery()
            .appendQueryParameter("token", token)
            .build()
            .toString()

        reconnectJob?.cancel()
        webSocket = webSocketClient.newWebSocket(
            Request.Builder().url(url).build(),
            socketListener,
        )
    }

    private fun scheduleReconnect() {
        if (preferences.getAuthToken().isNullOrBlank()) {
            stopSelf()
            return
        }
        if (reconnectJob?.isActive == true) return

        reconnectJob = scope.launch {
            delay(5000L)
            if (webSocket == null) {
                connect()
            }
        }
    }

    private val socketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "WebSocket connected for Push Service")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            handleIncomingMessage(text)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            clearSocket(webSocket)
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            clearSocket(webSocket)
            scheduleReconnect()
        }
    }

    private fun clearSocket(socket: WebSocket) {
        if (webSocket === socket) {
            webSocket = null
        }
    }

    private fun handleIncomingMessage(text: String) {
        try {
            val envelope = gson.fromJson(text, JsonObject::class.java)
            val type = envelope.get("type")?.asString ?: return
            val data = envelope.getAsJsonObject("data") ?: return

            when (type) {
                "chat_message" -> {
                    if (preferences.getNotifyChatMessages()) {
                        val senderId = data.get("sender_id")?.asLong
                        val myId = preferences.getUserId()
                        if (senderId != null && senderId == myId) return
                        
                        val convId = data.get("conversation_id")?.asLong?.toString() ?: return
                        val textStr = data.get("text")?.asString ?: "Новое сообщение"
                        showNotification(
                            channelId = FCMService.CHANNEL_ID_CHAT,
                            title = "Новое сообщение",
                            body = textStr,
                            id = convId.hashCode(),
                            chatId = convId
                        )
                    }
                }
                "task_assigned", "task_assigned_to_me", "task_created" -> {
                    if (preferences.getNotifyNewTasks()) {
                        val taskId = data.get("task_id")?.asLong?.toString() ?: return
                        val taskNum = data.get("task_number")?.asString ?: taskId
                        val title = data.get("title")?.asString ?: "Вам назначена заявка"
                        showNotification(
                            channelId = FCMService.CHANNEL_ID_TASKS,
                            title = "Новая заявка: $taskNum",
                            body = title,
                            id = taskId.hashCode(),
                            taskId = taskId
                        )
                    }
                }
                "task_status_changed" -> {
                    if (preferences.getNotifyStatusChange()) {
                        val taskId = data.get("task_id")?.asLong?.toString() ?: return
                        val taskNum = data.get("task_number")?.asString ?: taskId
                        val newStatus = data.get("new_status")?.asString ?: ""
                        showNotification(
                            channelId = FCMService.CHANNEL_ID_STATUS,
                            title = "Статус изменён",
                            body = "Заявка $taskNum переведена в статус $newStatus",
                            id = taskId.hashCode(),
                            taskId = taskId
                        )
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to handle websocket message", e)
        }
    }

    private fun showNotification(channelId: String, title: String, body: String, id: Int, taskId: String? = null, chatId: String? = null) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            taskId?.let { putExtra("task_id", it) }
            chatId?.let { putExtra("chat_id", it) }
        }
        val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(this, id, intent, pendingIntentFlags)

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(id, notification.build())
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Фоновая служба уведомлений",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Поддержание соединения для получения мгновенных уведомлений"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
