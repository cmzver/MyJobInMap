package com.fieldworker.data.repository

import android.content.Context
import android.net.Uri
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.dto.CreateCommentDto
import com.fieldworker.data.dto.UpdatePlannedDateDto
import com.fieldworker.data.dto.UpdateStatusDto
import com.fieldworker.data.mapper.toComments
import com.fieldworker.data.mapper.toDomain
import com.fieldworker.data.mapper.toDomainPhotos
import com.fieldworker.data.mapper.toDomainTasks
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.TaskStatus
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Репозиторий для работы с задачами.
 * Отвечает за загрузку данных с сервера и преобразование DTO в Domain модели.
 */
@Singleton
class TasksRepository @Inject constructor(
    private val tasksApi: TasksApi,
    @ApplicationContext private val context: Context
) {
    
    /**
     * Загрузить список задач назначенных текущему пользователю
     * @return Result с списком задач или ошибкой
     */
    suspend fun getTasks(): Result<List<Task>> = withContext(Dispatchers.IO) {
        try {
            // Работники видят только назначенные им заявки
            // Пока грузим первую страницу с большим лимитом для совместимости
            val response = tasksApi.getTasks(page = 1, size = 100, assignedToMe = true)
            
            if (response.isSuccessful) {
                val paginatedResponse = response.body()
                val tasks = paginatedResponse?.items?.toDomainTasks() ?: emptyList()
                Result.success(tasks)
            } else {
                Result.failure(
                    Exception("Ошибка сервера: ${response.code()} - ${response.message()}")
                )
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка сети: ${e.message}", e))
        }
    }
    
    /**
     * Получить детальную информацию о задаче с комментариями
     */
    suspend fun getTaskDetail(taskId: Long): Result<Pair<Task, List<Comment>>> = 
        withContext(Dispatchers.IO) {
            try {
                val response = tasksApi.getTaskDetail(taskId)
                
                if (response.isSuccessful) {
                    val dto = response.body()
                    if (dto != null) {
                        val task = dto.toDomain()
                        val comments = dto.toComments()
                        Result.success(Pair(task, comments))
                    } else {
                        Result.failure(Exception("Пустой ответ от сервера"))
                    }
                } else {
                    Result.failure(
                        Exception("Ошибка сервера: ${response.code()}")
                    )
                }
            } catch (e: Exception) {
                Result.failure(Exception("Ошибка сети: ${e.message}", e))
            }
        }
    
    /**
     * Обновить статус задачи с комментарием
     * @param taskId ID задачи
     * @param newStatus Новый статус
     * @param comment Комментарий к изменению
     * @return Result с обновленной задачей или ошибкой
     */
    suspend fun updateTaskStatus(
        taskId: Long, 
        newStatus: TaskStatus,
        comment: String = ""
    ): Result<Task> = withContext(Dispatchers.IO) {
        try {
            val response = tasksApi.updateTaskStatus(
                id = taskId,
                status = UpdateStatusDto(
                    status = newStatus.name,
                    comment = comment
                )
            )
            
            if (response.isSuccessful) {
                val dto = response.body()
                if (dto != null) {
                    Result.success(dto.toDomain())
                } else {
                    Result.failure(Exception("Пустой ответ от сервера"))
                }
            } else {
                Result.failure(
                    Exception("Ошибка сервера: ${response.code()} - ${response.message()}")
                )
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка сети: ${e.message}", e))
        }
    }
    
    /**
     * Добавить комментарий к задаче
     */
    suspend fun addComment(taskId: Long, text: String): Result<Comment> = 
        withContext(Dispatchers.IO) {
            try {
                val response = tasksApi.addComment(
                    id = taskId,
                    comment = CreateCommentDto(text = text)
                )
                
                if (response.isSuccessful) {
                    val dto = response.body()
                    if (dto != null) {
                        Result.success(dto.toDomain())
                    } else {
                        Result.failure(Exception("Пустой ответ"))
                    }
                } else {
                    Result.failure(Exception("Ошибка: ${response.code()}"))
                }
            } catch (e: Exception) {
                Result.failure(Exception("Ошибка сети: ${e.message}", e))
            }
        }
    
    /**
     * Обновить планируемую дату выполнения задачи
     */
    suspend fun updatePlannedDate(taskId: Long, plannedDate: String?): Result<Task> = 
        withContext(Dispatchers.IO) {
            try {
                val response = tasksApi.updatePlannedDate(
                    id = taskId,
                    plannedDate = UpdatePlannedDateDto(plannedDate = plannedDate)
                )
                
                if (response.isSuccessful) {
                    val dto = response.body()
                    if (dto != null) {
                        Result.success(dto.toDomain())
                    } else {
                        Result.failure(Exception("Пустой ответ"))
                    }
                } else {
                    Result.failure(Exception("Ошибка: ${response.code()}"))
                }
            } catch (e: Exception) {
                Result.failure(Exception("Ошибка сети: ${e.message}", e))
            }
        }
    
    // ==================== Task Photos ====================
    
    /**
     * Получить все фото заявки
     */
    suspend fun getTaskPhotos(taskId: Long): Result<List<TaskPhoto>> = 
        withContext(Dispatchers.IO) {
            try {
                val response = tasksApi.getTaskPhotos(taskId)
                
                if (response.isSuccessful) {
                    val photos = response.body()?.toDomainPhotos() ?: emptyList()
                    Result.success(photos)
                } else {
                    Result.failure(Exception("Ошибка: ${response.code()}"))
                }
            } catch (e: Exception) {
                Result.failure(Exception("Ошибка сети: ${e.message}", e))
            }
        }
    
    /**
     * Загрузить фото к заявке
     */
    suspend fun uploadTaskPhoto(
        taskId: Long, 
        imageUri: Uri,
        photoType: String = "completion"
    ): Result<TaskPhoto> = withContext(Dispatchers.IO) {
        try {
            // Читаем файл из Uri
            val inputStream = context.contentResolver.openInputStream(imageUri)
                ?: return@withContext Result.failure(Exception("Не удалось открыть файл"))
            
            // Оптимизация изображения
            val originalBitmap = BitmapFactory.decodeStream(inputStream)
            inputStream.close()
            
            if (originalBitmap == null) {
                return@withContext Result.failure(Exception("Не удалось декодировать изображение"))
            }
            
            // Сжимаем до 85% качества JPEG
            val outputStream = ByteArrayOutputStream()
            originalBitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)
            val compressedBytes = outputStream.toByteArray()
            originalBitmap.recycle()
            outputStream.close()
            
            // Определяем MIME тип и имя файла
            val mimeType = "image/jpeg" // Всегда отправляем как JPEG после сжатия
            val fileName = "photo_${System.currentTimeMillis()}.jpg"
            
            // Создаём MultipartBody
            val requestBody = compressedBytes.toRequestBody(mimeType.toMediaTypeOrNull())
            val filePart = MultipartBody.Part.createFormData("file", fileName, requestBody)
            
            val response = tasksApi.uploadTaskPhoto(taskId, filePart, photoType)
            
            if (response.isSuccessful) {
                val dto = response.body()
                if (dto != null) {
                    Result.success(dto.toDomain())
                } else {
                    Result.failure(Exception("Пустой ответ"))
                }
            } else {
                Result.failure(Exception("Ошибка: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка загрузки: ${e.message}", e))
        }
    }
    
    /**
     * Удалить фото
     */
    suspend fun deletePhoto(photoId: Long): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val response = tasksApi.deletePhoto(photoId)
            
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Ошибка: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка сети: ${e.message}", e))
        }
    }
}
