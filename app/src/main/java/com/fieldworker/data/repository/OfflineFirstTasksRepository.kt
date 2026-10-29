package com.fieldworker.data.repository

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.paging.map
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.image.ImageCompressor
import com.fieldworker.data.local.LocalTransactionRunner
import com.fieldworker.data.remote.generated.CommentCreate
import com.fieldworker.data.remote.generated.PlannedDateUpdate
import com.fieldworker.data.remote.generated.TaskAssignRequest
import com.fieldworker.data.remote.generated.TaskStatusUpdate
import com.fieldworker.data.remote.generated.TaskStatus as GenTaskStatus
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
import com.fieldworker.domain.model.FailedAction
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.TaskStatus
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
    private val transactionRunner: LocalTransactionRunner,
    private val networkMonitor: NetworkMonitor,
    private val imageCompressor: ImageCompressor,
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "OfflineTasksRepo"
        private const val PAGE_SIZE = 100
        /** Полная выгрузка — страховка от рассинхрона; между ними — только изменения. */
        private const val FULL_SYNC_INTERVAL_MS = 60 * 60_000L
        /** Перекрытие курсора: транзакция могла закоммититься позже с более ранним updated_at. */
        private const val CURSOR_OVERLAP_MINUTES = 2L
        /** Лимит параметров SQLite — 999 до API 30. */
        private const val DELETE_CHUNK_SIZE = 500
        private const val PAGING_PAGE_SIZE = 30
        private const val MAX_PENDING_RETRIES = 5
    }

    private val pendingSyncMutex = Mutex()
    
    /**
     * Flow всех задач из локальной БД (для карты — загружает все)
     */
    val tasksFlow: Flow<List<Task>> = taskDao.getAllTasksFlow()
        .map { entities -> entities.map { it.toDomain() } }
    
    /**
     * Paging 3 Flow задач из Room.
     * Используется в TaskListScreen для постраничной загрузки.
     * Room автоматически инвалидирует PagingSource при изменениях.
     * Данные обновляются через refreshTasks() → upsertTasks().
     */
    val tasksPagingFlow: Flow<PagingData<Task>> = Pager(
        config = PagingConfig(
            pageSize = PAGING_PAGE_SIZE,
            enablePlaceholders = false,
            prefetchDistance = PAGING_PAGE_SIZE / 2
        ),
        pagingSourceFactory = { taskDao.getAllTasksPagingSource() }
    ).flow.map { pagingData ->
        pagingData.map { entity -> entity.toDomain() }
    }
    
    /**
     * Flow количества отложенных действий (для UI индикатора)
     */
    val pendingActionsCount: Flow<Int> = pendingActionDao.getPendingActionsCountFlow()

    /** Действия, которые очередь больше не повторяет сама — их разбирает пользователь. */
    val failedActions: Flow<List<FailedAction>> = pendingActionDao
        .getFailedActionsFlow(MAX_PENDING_RETRIES)
        .map { actions -> actions.map { it.toFailedAction() } }
        .flowOn(Dispatchers.IO)

    /** Монотонное время последней полной выгрузки; null — в этом процессе её не было. */
    private var lastFullSyncAtMs: Long? = null
    
    /**
     * Загрузить задачи (сначала из кеша, потом обновить с сервера)
     */
    suspend fun refreshTasks(syncPendingFirst: Boolean = true): Result<List<Task>> = withContext(Dispatchers.IO) {
        if (syncPendingFirst && networkMonitor.isCurrentlyOnline()) {
            val syncResult = syncPendingActions()
            if (syncResult.requiresAuthentication) {
                return@withContext Result.failure(Exception("401 Unauthorized"))
            }
        }

        try {
            if (networkMonitor.isCurrentlyOnline()) {
                val now = SystemClock.elapsedRealtime()
                val cursor = taskDao.getMaxUpdatedAt()
                val lastFull = lastFullSyncAtMs
                val isFullSync = cursor == null || lastFull == null || now - lastFull >= FULL_SYNC_INTERVAL_MS
                val fetchResult = fetchAllTasksFromServer(
                    updatedSince = if (isFullSync) null else cursor?.let(::cursorWithOverlap)
                )
                fetchResult.fold(
                    onSuccess = { tasks ->
                        val locallyModifiedIds = taskDao.getLocallyModifiedTasks()
                            .mapTo(mutableSetOf()) { it.id }
                        val entities = tasks
                            .filterNot { it.id in locallyModifiedIds }
                            .map { TaskEntity.fromDomain(it) }
                        taskDao.upsertTasks(entities)

                        if (isFullSync) {
                            pruneTasksNotIn(tasks.mapTo(HashSet()) { it.id })
                            lastFullSyncAtMs = now
                        } else {
                            // Изменённые заявки не расскажут об удалённых и переназначенных —
                            // сверяемся со списком видимых ID. Не получилось — не удаляем.
                            fetchVisibleTaskIds()?.let { visibleIds ->
                                pruneTasksNotIn(visibleIds)
                                // Видна на сервере, но нет в кеше (не менялась с курсора) —
                                // по изменениям её не получить; следующий проход — полный.
                                val cachedIds = taskDao.getAllTaskIds().toHashSet()
                                if (visibleIds.any { it !in cachedIds }) lastFullSyncAtMs = null
                            }
                        }

                        Log.d(TAG, "Synced ${tasks.size} tasks from server (full=$isFullSync)")
                        Result.success(getTasksFromCache())
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
        } catch (e: CancellationException) {
            throw e
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

    /** Удалить из кеша синхронизированные задачи, которых больше нет на сервере. */
    private suspend fun pruneTasksNotIn(visibleIds: Set<Long>) {
        val stale = taskDao.getSyncedTaskIds().filterNot { it in visibleIds }
        stale.chunked(DELETE_CHUNK_SIZE).forEach { taskDao.deleteSyncedTasksByIds(it) }
        if (stale.isNotEmpty()) Log.d(TAG, "Pruned ${stale.size} tasks not visible on server")
    }

    private suspend fun fetchVisibleTaskIds(): Set<Long>? = try {
        val response = tasksApi.getTaskIds()
        response.body()?.takeIf { response.isSuccessful }?.ids?.toHashSet()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Log.w(TAG, "Task ids fetch failed: ${e.message}")
        null
    }

    /** Курсор минус перекрытие; формат как у сервера (ISO без зоны, naive UTC). */
    private fun cursorWithOverlap(cursor: String): String = try {
        java.time.LocalDateTime.parse(cursor.removeSuffix("Z").substringBefore('+'))
            .minusMinutes(CURSOR_OVERLAP_MINUTES)
            .toString()
    } catch (_: Exception) {
        cursor
    }

    private suspend fun fetchAllTasksFromServer(updatedSince: String? = null): Result<List<Task>> {
        val allTasks = mutableListOf<Task>()
        var page = 1
        var totalPages = 1

        while (page <= totalPages) {
            val response = tasksApi.getTasks(
                page = page,
                size = PAGE_SIZE,
                updatedSince = updatedSince
            )

            if (!response.isSuccessful) {
                if (response.code() == 401) {
                    // Не удаляем локальные изменения/outbox: пользователь может
                    // повторно войти и безопасно продолжить синхронизацию.
                    Log.w(TAG, "401 Unauthorized: user session must be renewed")
                    return Result.failure(Exception("401 Unauthorized"))
                }
                return Result.failure(Exception("Server error: ${response.code()}"))
            }

            val body = response.body()
                ?: return Result.failure(Exception("Empty response body"))

            allTasks.addAll(body.items.toDomainTasks())
            totalPages = if (body.pages > 0) body.pages.toInt() else 1
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
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Error getting task detail: ${e.message}", e)
                getTaskDetailFromCache(taskId)
            }
        }
    
    /**
     * Заявка и лента работ только из кеша — когда сервер заведомо недоступен
     * (сеть есть, сервер нет): не ждём таймаут подключения ради того же кеша.
     */
    suspend fun getCachedTaskDetail(taskId: Long): Result<Pair<Task, List<Comment>>> =
        withContext(Dispatchers.IO) { getTaskDetailFromCache(taskId) }

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
                    status = TaskStatusUpdate(status = GenTaskStatus.valueOf(newStatus.name), comment = comment)
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
                
                var updatedTask: Task? = null
                transactionRunner.run {
                    taskDao.updateStatusLocally(
                        taskId = taskId,
                        status = newStatus.name,
                        pendingStatus = newStatus.name,
                        comment = comment.ifEmpty { null }
                    )
                    pendingActionDao.insertPendingAction(
                        PendingAction(
                            taskId = taskId,
                            actionType = ActionType.UPDATE_STATUS,
                            newStatus = newStatus.name,
                            comment = comment.ifEmpty { null }
                        )
                    )
                    updatedTask = taskDao.getTaskById(taskId)?.toDomain()
                }
                if (updatedTask != null) {
                    Result.success(updatedTask!!)
                } else {
                    Result.failure(Exception("Задача не найдена"))
                }
            }
        } catch (e: CancellationException) {
            throw e
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
                        comment = CommentCreate(text = text)
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
                        id = -(UUID.randomUUID().mostSignificantBits and Long.MAX_VALUE), // Уникальный отрицательный временный ID
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
                    
                    transactionRunner.run {
                        commentDao.upsertComment(localComment)
                        pendingActionDao.insertPendingAction(
                            PendingAction(
                                taskId = taskId,
                                actionType = ActionType.ADD_COMMENT,
                                comment = text,
                                tempId = tempId
                            )
                        )
                    }
                    
                    Result.success(localComment.toDomain())
                }
            } catch (e: CancellationException) {
                throw e
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
                    plannedDate = PlannedDateUpdate(plannedDate = plannedDate)
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
                // Локальная запись и outbox должны попасть в БД атомарно.
                var updatedTask: Task? = null
                transactionRunner.run {
                    val entity = taskDao.getTaskById(taskId)
                    if (entity == null) return@run
                    val updated = entity.copy(
                        plannedDate = plannedDate,
                        isLocallyModified = true
                    )
                    taskDao.upsertTask(updated)
                    pendingActionDao.insertPendingAction(
                        PendingAction(
                            taskId = taskId,
                            actionType = ActionType.UPDATE_PLANNED_DATE,
                            plannedDate = plannedDate
                        )
                    )
                    updatedTask = updated.toDomain()
                }
                updatedTask?.let { Result.success(it) }
                    ?: Result.failure(Exception("Задача не найдена в кеше"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка обновления даты: ${e.message}", e))
        }
    }

    /**
     * Назначить исполнителя (null — снять). Только онлайн: назначение — действие
     * диспетчера, и офлайн-повтор поверх чужих изменений опаснее, чем явная ошибка.
     */
    suspend fun assignTask(taskId: Long, assigneeId: Long?): Result<Task> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isCurrentlyOnline()) {
            return@withContext Result.failure(Exception("Назначение доступно только при подключении к сети"))
        }
        try {
            val response = tasksApi.assignTask(taskId, TaskAssignRequest(assignedUserId = assigneeId))
            val dto = response.body()
            if (response.isSuccessful && dto != null) {
                val task = dto.toDomain()
                taskDao.upsertTask(TaskEntity.fromDomain(task))
                Result.success(task)
            } else {
                val message = when (response.code()) {
                    403 -> "Нет права назначать исполнителей"
                    404 -> "Заявка или исполнитель не найдены"
                    else -> "Ошибка назначения: ${response.code()}"
                }
                Result.failure(Exception(message))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(Exception(e.toUserMessage(), e))
        }
    }
    
    /**
     * Синхронизация отложенных действий при появлении сети
     */
    data class PendingSyncResult(
        val synced: Int = 0,
        val retryableFailures: Int = 0,
        val permanentFailures: Int = 0,
        val requiresAuthentication: Boolean = false
    )

    private enum class SyncOutcome { SUCCESS, RETRYABLE_FAILURE, PERMANENT_FAILURE, AUTH_REQUIRED }

    suspend fun syncPendingActions(): PendingSyncResult = pendingSyncMutex.withLock {
        syncPendingActionsInternal()
    }

    private suspend fun syncPendingActionsInternal(): PendingSyncResult = withContext(Dispatchers.IO) {
        if (!networkMonitor.isCurrentlyOnline()) {
            return@withContext PendingSyncResult()
        }
        
        val pendingActions = pendingActionDao.getSyncablePendingActions(MAX_PENDING_RETRIES)
        var syncedCount = 0
        var retryableFailures = 0
        var permanentFailures = 0
        var requiresAuthentication = false
        val blockedTaskIds = mutableSetOf<Long>()
        
        for (action in pendingActions) {
            if (action.taskId in blockedTaskIds) continue
            try {
                val outcome = when (action.actionType) {
                    ActionType.UPDATE_STATUS -> {
                        val status = action.newStatus
                        if (status == null) {
                            pendingActionDao.markAsFailed(
                                action.id, "Missing status payload", MAX_PENDING_RETRIES
                            )
                            permanentFailures++
                            blockedTaskIds += action.taskId
                            continue
                        }
                        val response = tasksApi.updateTaskStatus(
                            id = action.taskId,
                            status = TaskStatusUpdate(
                                status = GenTaskStatus.valueOf(status),
                                comment = action.comment ?: ""
                            ),
                            idempotencyKey = action.operationId.ifBlank { null }
                        )
                        
                        val body = response.body()
                        if (response.isSuccessful && body != null) {
                            transactionRunner.run {
                                pendingActionDao.deletePendingActionById(action.id)
                                val remaining = pendingActionDao.getPendingActionsForTask(action.taskId)
                                if (remaining.isEmpty()) {
                                    taskDao.upsertTask(TaskEntity.fromDomain(body.toDomain()))
                                    taskDao.markAsSynced(action.taskId)
                                }
                            }
                            SyncOutcome.SUCCESS
                        } else if (response.isSuccessful) {
                            pendingActionDao.incrementRetryCount(action.id, "Empty response body")
                            SyncOutcome.RETRYABLE_FAILURE
                        } else {
                            recordHttpFailure(action, response.code())
                        }
                    }
                    
                    ActionType.ADD_COMMENT -> {
                        val text = action.comment
                        if (text == null) {
                            pendingActionDao.markAsFailed(
                                action.id, "Missing comment payload", MAX_PENDING_RETRIES
                            )
                            permanentFailures++
                            blockedTaskIds += action.taskId
                            continue
                        }
                        val response = tasksApi.addComment(
                            id = action.taskId,
                            comment = CommentCreate(text = text),
                            idempotencyKey = action.operationId.ifBlank { null }
                        )
                        val body = response.body()
                        if (response.isSuccessful && body != null) {
                            transactionRunner.run {
                                action.tempId?.let { tempId ->
                                    commentDao.deleteByTempId(tempId)
                                }
                                commentDao.upsertComment(CommentEntity.fromDomain(body.toDomain()))
                                pendingActionDao.deletePendingActionById(action.id)
                            }
                            SyncOutcome.SUCCESS
                        } else if (response.isSuccessful) {
                            pendingActionDao.incrementRetryCount(action.id, "Empty response body")
                            SyncOutcome.RETRYABLE_FAILURE
                        } else {
                            recordHttpFailure(action, response.code())
                        }
                    }

                    ActionType.UPDATE_PLANNED_DATE -> {
                        val response = tasksApi.updatePlannedDate(
                            id = action.taskId,
                            plannedDate = PlannedDateUpdate(
                                plannedDate = action.plannedDate
                            ),
                            idempotencyKey = action.operationId.ifBlank { null }
                        )
                        val body = response.body()
                        if (response.isSuccessful && body != null) {
                            transactionRunner.run {
                                pendingActionDao.deletePendingActionById(action.id)
                                val remaining = pendingActionDao.getPendingActionsForTask(action.taskId)
                                if (remaining.isEmpty()) {
                                    taskDao.upsertTask(TaskEntity.fromDomain(body.toDomain()))
                                    taskDao.markAsSynced(action.taskId)
                                }
                            }
                            SyncOutcome.SUCCESS
                        } else if (response.isSuccessful) {
                            pendingActionDao.incrementRetryCount(action.id, "Empty response body")
                            SyncOutcome.RETRYABLE_FAILURE
                        } else {
                            recordHttpFailure(action, response.code())
                        }
                    }
                }
                
                when (outcome) {
                    SyncOutcome.SUCCESS -> {
                        syncedCount++
                        Log.d(TAG, "Synced pending action ${action.id}")
                    }
                    SyncOutcome.RETRYABLE_FAILURE -> {
                        retryableFailures++
                        blockedTaskIds += action.taskId
                    }
                    SyncOutcome.PERMANENT_FAILURE -> {
                        permanentFailures++
                        blockedTaskIds += action.taskId
                    }
                    SyncOutcome.AUTH_REQUIRED -> {
                        requiresAuthentication = true
                        break
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sync action ${action.id}: ${e.message}", e)
                pendingActionDao.incrementRetryCount(action.id, e.message)
                retryableFailures++
                blockedTaskIds += action.taskId
            }
        }
        
        PendingSyncResult(
            synced = syncedCount,
            retryableFailures = retryableFailures,
            permanentFailures = permanentFailures,
            requiresAuthentication = requiresAuthentication
        )
    }

    private suspend fun recordHttpFailure(action: PendingAction, code: Int): SyncOutcome {
        val message = "Server error: $code"
        return when {
            code == 401 -> SyncOutcome.AUTH_REQUIRED
            code == 408 || code == 429 || code >= 500 -> {
                pendingActionDao.incrementRetryCount(action.id, message)
                SyncOutcome.RETRYABLE_FAILURE
            }
            else -> {
                pendingActionDao.markAsFailed(action.id, message, MAX_PENDING_RETRIES)
                SyncOutcome.PERMANENT_FAILURE
            }
        }
    }
    
    /** Вернуть «провалившееся» действие в очередь и сразу попробовать отправить. */
    suspend fun retryFailedAction(actionId: Long): PendingSyncResult = withContext(Dispatchers.IO) {
        pendingActionDao.resetRetries(actionId)
        syncPendingActions()
    }

    /**
     * Отменить «провалившееся» действие: удалить его и локальные следы (черновик
     * комментария). Если по заявке больше ничего не ждёт отправки — вернуть её
     * к серверному состоянию.
     */
    suspend fun discardFailedAction(actionId: Long) = withContext(Dispatchers.IO) {
        val action = pendingActionDao.getPendingActionById(actionId) ?: return@withContext
        var restoreTask = false
        transactionRunner.run {
            pendingActionDao.deletePendingActionById(actionId)
            action.tempId?.let { commentDao.deleteByTempId(it) }
            restoreTask = pendingActionDao.getPendingActionsForTask(action.taskId).isEmpty()
        }
        if (restoreTask) restoreTaskFromServer(action.taskId)
    }

    private suspend fun restoreTaskFromServer(taskId: Long) {
        val restored = try {
            val response = tasksApi.getTaskDetail(taskId)
            val body = response.body()
            when {
                response.isSuccessful && body != null -> {
                    taskDao.upsertTask(TaskEntity.fromDomain(body.toDomain()))
                    taskDao.markAsSynced(taskId)
                    true
                }
                // Заявку удалили или отняли доступ — локальной копии больше не место
                response.code() == 403 || response.code() == 404 -> {
                    taskDao.markAsSynced(taskId) // снять флаг, иначе DELETE её пропустит
                    taskDao.deleteSyncedTasksByIds(listOf(taskId))
                    true
                }
                else -> false
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
        if (!restored) {
            // Без сети: снимаем «локально изменена», а следующий refresh — полный,
            // чтобы перезаписать заявку серверной версией.
            taskDao.markAsSynced(taskId)
            lastFullSyncAtMs = null
        }
    }

    private suspend fun PendingAction.toFailedAction(): FailedAction {
        val task = taskDao.getTaskById(taskId)
        val label = task?.let { entity ->
            val domain = entity.toDomain()
            "#${domain.getDisplayNumber()} · ${domain.address}"
        } ?: "Заявка #$taskId"
        val description = when (actionType) {
            ActionType.UPDATE_STATUS -> {
                val status = newStatus?.let { TaskStatus.fromString(it).displayName } ?: "—"
                "Смена статуса → $status"
            }
            ActionType.ADD_COMMENT -> "Комментарий: «${comment.orEmpty().take(60)}»"
            ActionType.UPDATE_PLANNED_DATE ->
                "Плановая дата → ${plannedDate?.substringBefore('T') ?: "снять"}"
        }
        return FailedAction(
            id = id,
            taskId = taskId,
            taskLabel = label,
            description = description,
            reason = failureReason(lastError),
        )
    }

    private fun failureReason(lastError: String?): String {
        val code = lastError?.substringAfter("Server error: ", "")?.toIntOrNull()
        return when (code) {
            400, 409, 422 -> "Сервер отклонил изменение: оно конфликтует с текущим состоянием заявки"
            403 -> "Нет прав на это действие"
            404 -> "Заявка не найдена — возможно, удалена"
            null -> lastError?.takeIf { it.isNotBlank() }?.let { "Не удалось отправить: $it" }
                ?: "Не удалось отправить после нескольких попыток"
            else -> "Ошибка сервера ($code)"
        }
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
            } catch (e: CancellationException) {
                throw e
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
            // Сжимаем перед отправкой (ресайз до 1920px, JPEG q85). При неудаче
            // декодирования (например, HEIC на старых API) — отправим как есть.
            val compressed = imageCompressor.compress(imageUri, fileNamePrefix = "photo")

            val bytes: ByteArray
            val mimeType: String
            val fileName: String
            if (compressed != null) {
                bytes = compressed.bytes
                mimeType = compressed.mimeType
                fileName = compressed.fileName
            } else {
                val inputStream = context.contentResolver.openInputStream(imageUri)
                    ?: return@withContext Result.failure(Exception("Не удалось открыть файл"))
                bytes = inputStream.use { it.readBytes() }
                mimeType = context.contentResolver.getType(imageUri) ?: "image/jpeg"
                fileName = "photo_${System.currentTimeMillis()}.jpg"
            }

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
        } catch (e: CancellationException) {
            throw e
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
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка сети: ${e.message}", e))
        }
    }
}
