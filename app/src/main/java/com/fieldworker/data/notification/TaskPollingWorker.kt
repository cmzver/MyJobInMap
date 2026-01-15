package com.fieldworker.data.notification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.fieldworker.R
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.ui.MainActivity
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Worker для периодической проверки новых задач.
 * Работает как fallback когда FCM недоступен (без Google Play Services).
 */
@HiltWorker
class TaskPollingWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted workerParams: WorkerParameters,
    private val tasksApi: TasksApi,
    private val preferences: AppPreferences
) : CoroutineWorker(context, workerParams) {
    
    companion object {
        private const val TAG = "TaskPollingWorker"
        const val WORK_NAME = "task_polling_work"
    }
    
    override suspend fun doWork(): Result {
        Log.d(TAG, "=== Polling started ===")
        Log.d(TAG, "Server URL: ${preferences.getFullServerUrl()}")
        Log.d(TAG, "Notifications enabled: ${preferences.getNotificationsEnabled()}")
        Log.d(TAG, "Notify new tasks: ${preferences.getNotifyNewTasks()}")
        Log.d(TAG, "Last checked ID: ${preferences.getLastCheckedTaskId()}")
        
        if (!preferences.getNotificationsEnabled() || !preferences.getNotifyNewTasks()) {
            Log.d(TAG, "Notifications disabled, skipping")
            return Result.success()
        }
        
        return try {
            Log.d(TAG, "Calling API...")
            val response = tasksApi.getTasks()
            Log.d(TAG, "API response code: ${response.code()}")
            
            if (response.isSuccessful) {
                val tasks = response.body()?.items ?: emptyList()
                Log.d(TAG, "Received ${tasks.size} tasks from server")
                
                val lastCheckedId = preferences.getLastCheckedTaskId().toLong()
                
                // Находим новые задачи (с ID больше последнего проверенного)
                val newTasks = tasks.filter { it.id > lastCheckedId }
                
                if (newTasks.isNotEmpty()) {
                    Log.d(TAG, "Found ${newTasks.size} NEW tasks!")
                    
                    // Показываем уведомление о новых задачах
                    newTasks.forEach { task ->
                        Log.d(TAG, "Showing notification for task: ${task.taskNumber}")
                        showNotification(
                            title = "Новая заявка",
                            body = "${task.taskNumber ?: "№${task.id}"}: ${task.title}",
                            taskId = task.id.toInt()
                        )
                    }
                    
                    // Обновляем последний проверенный ID
                    val maxId = tasks.maxOfOrNull { it.id }?.toInt() ?: preferences.getLastCheckedTaskId()
                    preferences.setLastCheckedTaskId(maxId)
                    Log.d(TAG, "Updated lastCheckedId to: $maxId")
                } else {
                    Log.d(TAG, "No new tasks (all IDs <= $lastCheckedId)")
                }
                
                Log.d(TAG, "=== Polling completed successfully ===")
                Result.success()
            } else {
                Log.e(TAG, "API error: ${response.code()} - ${response.message()}")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Polling FAILED with exception: ${e.message}", e)
            Result.retry()
        }
    }
    
    private fun showNotification(title: String, body: String, taskId: Int) {
        val intent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("task_id", taskId.toString())
        }
        
        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            taskId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(applicationContext, FCMService.CHANNEL_ID_TASKS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        
        val notificationManager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(taskId, notification)
    }
}
