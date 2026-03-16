package com.fieldworker.data.repository

import android.content.Context
import android.util.Log
import com.fieldworker.data.api.AuthApi
import com.fieldworker.data.dto.UpdateCheckDto
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.coroutineContext

/**
 * Репозиторий для проверки и загрузки обновлений приложения.
 */
@Singleton
class UpdateRepository @Inject constructor(
    private val authApi: AuthApi,
    @ApplicationContext private val context: Context
) {
    
    companion object {
        private const val TAG = "UpdateRepository"
    }
    
    /**
     * Проверить наличие обновления.
     * 
     * @param currentVersionCode текущий versionCode приложения
     * @param currentVersionName текущая версия приложения
     * @return информация об обновлении или null если ошибка
     */
    suspend fun checkForUpdate(
        currentVersionCode: Int,
        currentVersionName: String
    ): Result<UpdateCheckDto> {
        return try {
            val response = authApi.checkUpdate(currentVersionCode, currentVersionName)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Log.w(TAG, "Check update failed: ${response.code()}")
                Result.failure(Exception("Server error: ${response.code()}"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Check update error", e)
            Result.failure(e)
        }
    }
    
    /**
     * Скачать APK файл обновления.
     * 
     * Поддерживает отмену через coroutine cancellation — если корутина
     * отменена, загрузка прерывается и частичный файл удаляется.
     * 
     * @param onProgress колбэк с прогрессом загрузки (0..100), вызывается на Main-потоке
     * @return путь к скачанному файлу
     */
    suspend fun downloadUpdate(onProgress: (Int) -> Unit = {}): Result<File> {
        return try {
            val response = authApi.downloadUpdate()
            if (!response.isSuccessful || response.body() == null) {
                return Result.failure(Exception("Download failed: ${response.code()}"))
            }
            
            val body = response.body()!!
            val totalBytes = body.contentLength()
            
            // Сохраняем в cache директорию приложения
            val apkDir = File(context.cacheDir, "updates")
            apkDir.mkdirs()
            
            // Удаляем старые APK
            apkDir.listFiles()?.forEach { it.delete() }
            
            val apkFile = File(apkDir, "update.apk")
            
            try {
                withContext(Dispatchers.IO) {
                    body.byteStream().use { input ->
                        apkFile.outputStream().use { output ->
                            val buffer = ByteArray(8192)
                            var bytesRead: Long = 0
                            var read: Int
                            var lastReportedProgress = -1
                            
                            while (input.read(buffer).also { read = it } != -1) {
                                // Проверяем отмену корутины
                                coroutineContext.ensureActive()
                                
                                output.write(buffer, 0, read)
                                bytesRead += read
                                
                                if (totalBytes > 0) {
                                    val progress = (bytesRead * 100 / totalBytes).toInt()
                                        .coerceIn(0, 100)
                                    if (progress != lastReportedProgress) {
                                        lastReportedProgress = progress
                                        // Обновляем прогресс на Main-потоке
                                        withContext(Dispatchers.Main) {
                                            onProgress(progress)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                // Удаляем частично загруженный файл
                apkFile.delete()
                Log.d(TAG, "Download cancelled, partial file deleted")
                throw e
            }
            
            Log.d(TAG, "APK downloaded: ${apkFile.length()} bytes")
            Result.success(apkFile)
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e // Не оборачиваем cancellation в Result.failure
        } catch (e: Exception) {
            Log.e(TAG, "Download error", e)
            Result.failure(e)
        }
    }
}
