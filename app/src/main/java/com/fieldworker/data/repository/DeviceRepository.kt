package com.fieldworker.data.repository

import android.util.Log
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.dto.FCMTokenDto
import com.fieldworker.data.preferences.AppPreferences
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Репозиторий для управления регистрацией устройства
 */
@Singleton
class DeviceRepository @Inject constructor(
    private val tasksApi: TasksApi,
    private val preferences: AppPreferences
) {
    companion object {
        private const val TAG = "DeviceRepository"
    }
    
    /**
     * Регистрирует устройство на сервере
     */
    suspend fun registerDevice(): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Getting FCM token...")
            
            // Получаем FCM токен
            val token = try {
                FirebaseMessaging.getInstance().token.await()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get FCM token", e)
                return@withContext Result.failure(e)
            }
            
            Log.d(TAG, "FCM token received: ${token.take(30)}...")
            
            // Сохраняем локально
            preferences.setFcmToken(token)
            
            // Отправляем на сервер
            val dto = FCMTokenDto.withDeviceInfo(token)
            Log.d(TAG, "Registering device: ${dto.deviceName}")
            
            val response = tasksApi.registerDevice(dto)
            
            if (response.isSuccessful) {
                Log.d(TAG, "✅ Device registered successfully")
                Result.success(true)
            } else {
                val error = "Failed to register: ${response.code()} ${response.message()}"
                Log.e(TAG, error)
                Result.failure(Exception(error))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error registering device", e)
            Result.failure(e)
        }
    }
    
    /**
     * Удаляет регистрацию устройства
     */
    suspend fun unregisterDevice(): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val token = preferences.getFcmToken() ?: return@withContext Result.success(true)
            
            val response = tasksApi.unregisterDevice(FCMTokenDto(token))
            
            if (response.isSuccessful) {
                preferences.setFcmToken(null.toString())
                Log.d(TAG, "Device unregistered")
                Result.success(true)
            } else {
                Result.failure(Exception("Failed to unregister"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering device", e)
            Result.failure(e)
        }
    }
}
