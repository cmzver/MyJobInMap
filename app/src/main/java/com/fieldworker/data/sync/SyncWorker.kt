package com.fieldworker.data.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.fieldworker.data.repository.OfflineFirstTasksRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

/**
 * Worker для фоновой синхронизации данных.
 * Запускается при появлении сети для синхронизации offline-изменений.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted workerParams: WorkerParameters,
    private val repository: OfflineFirstTasksRepository
) : CoroutineWorker(context, workerParams) {
    
    companion object {
        private const val TAG = "SyncWorker"
        const val WORK_NAME = "sync_work"
        
        /**
         * Создать одноразовый запрос на синхронизацию
         */
        fun createOneTimeRequest(): OneTimeWorkRequest {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            
            return OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .build()
        }
        
        /**
         * Создать периодический запрос на синхронизацию
         */
        fun createPeriodicRequest(): PeriodicWorkRequest {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            
            return PeriodicWorkRequestBuilder<SyncWorker>(
                15, TimeUnit.MINUTES, // Минимальный интервал
                5, TimeUnit.MINUTES  // Flex interval
            )
                .setConstraints(constraints)
                .build()
        }
    }
    
    override suspend fun doWork(): Result {
        Log.d(TAG, "Starting sync work")
        
        return try {
            // Синхронизируем отложенные действия
            val syncedActions = repository.syncPendingActions()
            Log.d(TAG, "Synced $syncedActions pending actions")
            
            // Обновляем данные с сервера
            val result = repository.refreshTasks()
            
            if (result.isSuccess) {
                Log.d(TAG, "Sync completed successfully")
                Result.success()
            } else {
                Log.e(TAG, "Sync failed: ${result.exceptionOrNull()?.message}")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Sync error: ${e.message}", e)
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }
}
