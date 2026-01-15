package com.fieldworker.data.repository

import android.content.Context
import android.net.Uri
import android.util.Log
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.dto.CreateCommentDto
import com.fieldworker.data.dto.UpdatePlannedDateDto
import com.fieldworker.data.dto.UpdateStatusDto
import com.fieldworker.data.local.dao.CommentDao
import com.fieldworker.data.local.dao.PendingActionDao
import com.fieldworker.data.local.dao.TaskDao
import com.fieldworker.data.local.entity.ActionType
import com.fieldworker.data.local.entity.CommentEntity
import com.fieldworker.data.local.entity.PendingAction
import com.fieldworker.data.local.entity.TaskEntity
import com.fieldworker.data.mapper.toComments
import com.fieldworker.data.mapper.toDomain
import com.fieldworker.data.mapper.toDomainPhotos
import com.fieldworker.data.mapper.toDomainTasks
import com.fieldworker.data.network.NetworkError
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.network.toUserMessage
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.TaskStatus
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Репозиторий для работы с задачами с поддержкой offline-режима.
 * 
 * Стратегия:
 * - Online: загружаем с сервера, сохраняем в Room, синхронизируем pending actions
 * - Offline: читаем из Room, сохраняем изменения как pending actions
 */
@Singleton
class OfflineFirstTasksRepository @Inject constructor(
    private val tasksApi: TasksApi,
    private val taskDao: TaskDao,
    private val commentDao: CommentDao,
    private val pendingActionDao: PendingActionDao,
    private val networkMonitor: NetworkMonitor,
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "OfflineTasksRepo"
        private const val PAGE_SIZE = 100
    }
    
    /**
     * Flow всех задач из локальной БД
     */
    val tasksFlow: Flow<List<Task>> = taskDao.getAllTasksFlow()
        .map { entities -> entities.map { it.toDomain() } }
    
    /**
     * Flow количества отложенных действий (для UI индикатора)
     */
    val pendingActionsCount: Flow<Int> = pendingActionDao.getPendingActionsCountFlow()
    
    /**
     * Загрузить задачи (сначала из кеша, потом обновить с сервера)
     */
    suspend fun refreshTasks(): Result<List<Task>> = withContext(Dispatchers.IO) {
        if (networkMonitor.isCurrentlyOnline()) {
            syncPendingActions()
        }

        try {
            if (networkMonitor.isCurrentlyOnline()) {
                val fetchResult = fetchAllTasksFromServer()
                fetchResult.fold(
                    onSuccess = { tasks ->
                        val entities = tasks.map { TaskEntity.fromDomain(it) }
                        taskDao.upsertTasks(entities)

                        val serverIds = tasks.map { it.id }
                        taskDao.deleteTasksNotIn(serverIds)

                        Log.d(TAG, "Synced ${tasks.size} tasks from server")
                        Result.success(tasks)
                    },
                    onFailure = { error ->
                        if (error.message?.contains("401") == true) {
                            Result.failure(error)
                        } else {
                            Log.e(TAG, "Server error: ${error.message}")
                            Result.success(getTasksFromCache())
                        }
                    }
                )
            } else {
                Log.d(TAG, "Offline mode, returning cached tasks")
                Result.success(getTasksFromCache())
            }
        } catch (e: Exception) {
            Log.e(TAG, "Network error: ${e.message}", e)
            val cached = getTasksFromCache()
            if (cached.isNotEmpty()) {
                Result.success(cached)
            } else {
                Result.failure(Exception(e.toUserMessage()))
            }
        }
    }

    
    /**
     * Получить задачи из кеша
     */
    private suspend fun getTasksFromCache(): List<Task> {
        return taskDao.getAllTasks().map { it.toDomain() }
    }

    private suspend fun fetchAllTasksFromServer(): Result<List<Task>> {
        val allTasks = mutableListOf<Task>()
        var page = 1
        var totalPages = 1

        while (page <= totalPages) {
            val response = tasksApi.getTasks(
                page = page,
                size = PAGE_SIZE,
                assignedToMe = true
            )

            if (!response.isSuccessful) {
                if (response.code() == 401) {
                    Log.w(TAG, "401 Unauthorized: User session invalid, clearing cache")
                    clearCache()
                    return Result.failure(Exception("401 Unauthorized"))
                }
                return Result.failure(Exception("Server error: ${response.code()}"))
            }

            val body = response.body()
                ?: return Result.failure(Exception("Empty response body"))

            allTasks.addAll(body.items.toDomainTasks())
            totalPages = if (body.pages > 0) body.pages else 1
            page += 1
        }

        return Result.success(allTasks)
    }

    
    /**
     * Получить детальную информацию о задаче
     */
    suspend fun getTaskDetail(taskId: Long): Result<Pair<Task, List<Comment>>> = 
        withContext(Dispatchers.IO) {
            try {
                if (networkMonitor.isCurrentlyOnline()) {
                    val response = tasksApi.getTaskDetail(taskId)
                    
                    if (response.isSuccessful) {
                        val dto = response.body()
                        if (dto != null) {
                            val task = dto.toDomain()
                            val comments = dto.toComments()
                            
                            // Сохраняем в кеш
                            taskDao.upsertTask(TaskEntity.fromDomain(task))
                            commentDao.upsertComments(comments.map { CommentEntity.fromDomain(it) })
                            
                            Result.success(Pair(task, comments))
                        } else {
                            Result.failure(Exception("Пустой ответ от сервера"))
                        }
                    } else {
                        // Пробуем из кеша
                        getTaskDetailFromCache(taskId)
                    }
                } else {
                    // Offline: из кеша
                    getTaskDetailFromCache(taskId)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error getting task detail: ${e.message}", e)
                getTaskDetailFromCache(taskId)
            }
        }
    
    private suspend fun getTaskDetailFromCache(taskId: Long): Result<Pair<Task, List<Comment>>> {
        val taskEntity = taskDao.getTaskById(taskId)
        return if (taskEntity != null) {
            val comments = commentDao.getCommentsForTask(taskId).map { it.toDomain() }
            Result.success(Pair(taskEntity.toDomain(), comments))
        } else {
            Result.failure(Exception("Задача не найдена в кеше"))
        }
    }
    
    /**
     * Обновить статус задачи.
     * В offline-режиме сохраняет как pending action.
     */
    suspend fun updateTaskStatus(
        taskId: Long,
        newStatus: TaskStatus,
        comment: String = ""
    ): Result<Task> = withContext(Dispatchers.IO) {
        try {
            if (networkMonitor.isCurrentlyOnline()) {
                // Online: отправляем на сервер
                val response = tasksApi.updateTaskStatus(
                    id = taskId,
                    status = UpdateStatusDto(status = newStatus.name, comment = comment)
                )
                
                if (response.isSuccessful) {
                    val dto = response.body()
                    if (dto != null) {
                        val task = dto.toDomain()
                        
                        // Обновляем кеш
                        taskDao.upsertTask(TaskEntity.fromDomain(task))
                        
                        Log.d(TAG, "Task $taskId status updated to ${newStatus.name}")
                        Result.success(task)
                    } else {
                        Result.failure(Exception("Пустой ответ от сервера"))
                    }
                } else {
                    Result.failure(Exception("Ошибка сервера: ${response.code()}"))
                }
            } else {
                // Offline: сохраняем локально
                Log.d(TAG, "Offline: saving status update as pending action")
                
                // Обновляем локально
                taskDao.updateStatusLocally(
                    taskId = taskId,
                    status = newStatus.name,
                    pendingStatus = newStatus.name,
                    comment = comment.ifEmpty { null }
                )
                
                // Создаём pending action
                pendingActionDao.insertPendingAction(
                    PendingAction(
                        taskId = taskId,
                        actionType = ActionType.UPDATE_STATUS,
                        newStatus = newStatus.name,
                        comment = comment.ifEmpty { null }
                    )
                )
                
                // Возвращаем обновлённую задачу из кеша
                val updatedTask = taskDao.getTaskById(taskId)?.toDomain()
                if (updatedTask != null) {
                    Result.success(updatedTask)
                } else {
                    Result.failure(Exception("Задача не найдена"))
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error updating task status: ${e.message}", e)
            Result.failure(Exception("Ошибка обновления статуса: ${e.message}", e))
        }
    }
    
    /**
     * Добавить комментарий
     */
    suspend fun addComment(taskId: Long, text: String): Result<Comment> =
        withContext(Dispatchers.IO) {
            try {
                if (networkMonitor.isCurrentlyOnline()) {
                    val response = tasksApi.addComment(
                        id = taskId,
                        comment = CreateCommentDto(text = text)
                    )
                    
                    if (response.isSuccessful) {
                        val dto = response.body()
                        if (dto != null) {
                            val comment = dto.toDomain()
                            
                            // Сохраняем в кеш
                            commentDao.upsertComment(CommentEntity.fromDomain(comment))
                            
                            Result.success(comment)
                        } else {
                            Result.failure(Exception("Пустой ответ"))
                        }
                    } else {
                        Result.failure(Exception("Ошибка: ${response.code()}"))
                    }
                } else {
                    // Offline: создаём локальный комментарий
                    val tempId = UUID.randomUUID().toString()
                    val localComment = CommentEntity(
                        id = -System.currentTimeMillis(), // Отрицательный временный ID
                        taskId = taskId,
                        text = text,
                        author = "Сотрудник",
                        oldStatus = null,
                        newStatus = null,
                        createdAt = java.text.SimpleDateFormat(
                            "yyyy-MM-dd'T'HH:mm:ss", 
                            java.util.Locale.getDefault()
                        ).format(java.util.Date()),
                        isLocalOnly = true,
                        tempId = tempId
                    )
                    
                    commentDao.upsertComment(localComment)
                    
                    // Сохраняем pending action
                    pendingActionDao.insertPendingAction(
                        PendingAction(
                            taskId = taskId,
                            actionType = ActionType.ADD_COMMENT,
                            comment = text,
                            tempId = tempId
                        )
                    )
                    
                    Result.success(localComment.toDomain())
                }
            } catch (e: Exception) {
                Result.failure(Exception("Ошибка добавления комментария: ${e.message}", e))
            }
        }
    
    /**
     * Обновить планируемую дату выполнения задачи
     */
    suspend fun updatePlannedDate(
        taskId: Long,
        plannedDate: String?
    ): Result<Task> = withContext(Dispatchers.IO) {
        try {
            if (networkMonitor.isCurrentlyOnline()) {
                val response = tasksApi.updatePlannedDate(
                    id = taskId,
                    plannedDate = UpdatePlannedDateDto(plannedDate = plannedDate)
                )
                
                if (response.isSuccessful) {
                    val dto = response.body()
                    if (dto != null) {
                        val task = dto.toDomain()
                        
                        // Обновляем кеш
                        taskDao.upsertTask(TaskEntity.fromDomain(task))
                        
                        Result.success(task)
                    } else {
                        Result.failure(Exception("Пустой ответ"))
                    }
                } else {
                    Result.failure(Exception("Ошибка: ${response.code()}"))
                }
            } else {
                // Offline: обновляем локально
                val entity = taskDao.getTaskById(taskId)
                if (entity != null) {
                    taskDao.upsertTask(entity.copy(plannedDate = plannedDate, isLocallyModified = true))
                    Result.success(entity.copy(plannedDate = plannedDate).toDomain())
                } else {
                    Result.failure(Exception("Задача не найдена в кеше"))
                }
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка обновления даты: ${e.message}", e))
        }
    }
    
    /**
     * Синхронизация отложенных действий при появлении сети
     */
    suspend fun syncPendingActions(): Int = withContext(Dispatchers.IO) {
        if (!networkMonitor.isCurrentlyOnline()) {
            return@withContext 0
        }
        
        val pendingActions = pendingActionDao.getAllPendingActions()
        var syncedCount = 0
        
        for (action in pendingActions) {
            try {
                val success = when (action.actionType) {
                    ActionType.UPDATE_STATUS -> {
                        val status = action.newStatus ?: continue
                        val response = tasksApi.updateTaskStatus(
                            id = action.taskId,
                            status = UpdateStatusDto(
                                status = status,
                                comment = action.comment ?: ""
                            )
                        )
                        
                        if (response.isSuccessful) {
                            response.body()?.let { dto ->
                                val task = dto.toDomain()
                                taskDao.upsertTask(TaskEntity.fromDomain(task))
                                taskDao.markAsSynced(action.taskId)
                            }
                            true
                        } else {
                            false
                        }
                    }
                    
                    ActionType.ADD_COMMENT -> {
                        val text = action.comment ?: continue
                        val response = tasksApi.addComment(
                            id = action.taskId,
                            comment = CreateCommentDto(text = text)
                        )
                        if (response.isSuccessful) {
                            val dto = response.body()
                            if (dto != null) {
                                val comment = dto.toDomain()
                                action.tempId?.let { tempId ->
                                    commentDao.deleteByTempId(tempId)
                                }
                                commentDao.upsertComment(CommentEntity.fromDomain(comment))
                            } else {
                                action.tempId?.let { tempId ->
                                    commentDao.deleteByTempId(tempId)
                                }
                            }
                            true
                        } else {
                            false
                        }
                    }
                }
                
                if (success) {
                    pendingActionDao.deletePendingActionById(action.id)
                    syncedCount++
                    Log.d(TAG, "Synced pending action ${action.id}")
                } else {
                    pendingActionDao.incrementRetryCount(action.id, "Server error")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sync action ${action.id}: ${e.message}", e)
                pendingActionDao.incrementRetryCount(action.id, e.message)
            }
        }
        
        Log.d(TAG, "Synced $syncedCount pending actions")
        syncedCount
    }
    
    /**
     * Очистить локальный кеш (при выходе из аккаунта)
     */
    suspend fun clearCache() = withContext(Dispatchers.IO) {
        taskDao.deleteAllTasks()
        pendingActionDao.deleteAllPendingActions()
        Log.d(TAG, "Cache cleared")
    }
    
    /**
     * Проверить, есть ли кешированные данные
     */
    suspend fun hasCachedData(): Boolean = withContext(Dispatchers.IO) {
        taskDao.getTasksCount() > 0
    }
    
    /**
     * Получить время последней синхронизации
     */
    suspend fun getLastSyncTime(): Long? = withContext(Dispatchers.IO) {
        taskDao.getLastSyncTime()
    }
    
    // ================== Фотографии ==================
    
    /**
     * Получить список фотографий задачи
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
            
            val bytes = inputStream.use { it.readBytes() }
            
            // Определяем MIME тип и имя файла
            val mimeType = context.contentResolver.getType(imageUri) ?: "image/jpeg"
            val fileName = "photo_${System.currentTimeMillis()}.jpg"
            
            // Создаём MultipartBody
            val requestBody = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
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
