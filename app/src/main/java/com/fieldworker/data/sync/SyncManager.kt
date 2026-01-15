package com.fieldworker.data.sync

import android.content.Context
import android.util.Log
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Менеджер синхронизации.
 * Управляет запуском WorkManager для синхронизации данных.
 */
@Singleton
class SyncManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "SyncManager"
        private const val PERIODIC_SYNC_WORK = "periodic_sync"
        private const val IMMEDIATE_SYNC_WORK = "immediate_sync"
    }
    
    private val workManager = WorkManager.getInstance(context)
    
    /**
     * Запустить немедленную синхронизацию
     */
    fun triggerImmediateSync() {
        Log.d(TAG, "Triggering immediate sync")
        
        workManager.enqueueUniqueWork(
            IMMEDIATE_SYNC_WORK,
            ExistingWorkPolicy.REPLACE,
            SyncWorker.createOneTimeRequest()
        )
    }
    
    /**
     * Запустить периодическую синхронизацию
     */
    fun startPeriodicSync() {
        Log.d(TAG, "Starting periodic sync")
        
        workManager.enqueueUniquePeriodicWork(
            PERIODIC_SYNC_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            SyncWorker.createPeriodicRequest()
        )
    }
    
    /**
     * Остановить периодическую синхронизацию
     */
    fun stopPeriodicSync() {
        Log.d(TAG, "Stopping periodic sync")
        workManager.cancelUniqueWork(PERIODIC_SYNC_WORK)
    }
    
    /**
     * Отменить все задачи синхронизации
     */
    fun cancelAllSync() {
        Log.d(TAG, "Cancelling all sync work")
        workManager.cancelAllWork()
    }
}
