package com.fieldworker.next.data.repository

import com.fieldworker.next.data.remote.BaseUrlProvider
import com.fieldworker.next.data.remote.api.PortalTasksApi
import com.fieldworker.next.data.remote.mapper.toTaskComment
import com.fieldworker.next.data.remote.mapper.toTaskDetail
import com.fieldworker.next.data.remote.mapper.toTaskPhoto
import com.fieldworker.next.data.remote.mapper.toTaskSummary
import com.fieldworker.next.data.remote.model.PortalCreateCommentRequest
import com.fieldworker.next.data.remote.model.PortalStatusUpdateRequest
import com.fieldworker.next.data.remote.store.PortalSessionStore
import com.fieldworker.next.data.remote.toAppError
import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskComment
import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.model.TaskPhoto
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.model.TaskSummary
import com.fieldworker.next.domain.model.toSummary
import com.fieldworker.next.domain.repository.TaskRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

class RemoteTaskRepository(
    private val tasksApi: PortalTasksApi,
    private val sessionStore: PortalSessionStore,
    private val baseUrlProvider: BaseUrlProvider,
) : TaskRepository {
    private val taskSummaries = MutableStateFlow<List<TaskSummary>>(emptyList())
    private val taskDetails = MutableStateFlow<Map<Long, TaskDetail>>(emptyMap())

    override fun observeAssignedTasks(): Flow<List<TaskSummary>> = taskSummaries

    override fun observeTaskDetail(taskId: Long): Flow<TaskDetail?> {
        return taskDetails.map { items -> items[taskId] }
    }

    override suspend fun refreshAssignedTasks(): AppResult<List<TaskSummary>> {
        return refreshAssignedTasks(page = 1, size = 50)
    }

    suspend fun refreshAssignedTasks(
        page: Int = 1,
        size: Int = 50,
        statuses: List<TaskStatus> = emptyList(),
        nowIso: String? = null,
    ): AppResult<List<TaskSummary>> {
        val accessToken = sessionStore.read()?.accessToken
            ?: return AppResult.Failure(AppError.Unauthorized)

        return try {
            val response = tasksApi.getTasks(
                accessToken = accessToken,
                page = page,
                size = size,
                statuses = statuses.map(TaskStatus::name),
            )
            val mappedTasks = response.items.map { item ->
                item.toTaskSummary(nowIso = nowIso)
            }
            taskSummaries.value = mappedTasks
            AppResult.Success(mappedTasks)
        } catch (error: Throwable) {
            AppResult.Failure(error.toAppError())
        }
    }

    suspend fun refreshTaskDetail(
        taskId: Long,
        nowIso: String? = null,
    ): AppResult<TaskDetail> {
        val accessToken = sessionStore.read()?.accessToken
            ?: return AppResult.Failure(AppError.Unauthorized)

        return try {
            val baseUrl = baseUrlProvider.getBaseUrl()
            val detailDto = tasksApi.getTaskDetail(accessToken = accessToken, taskId = taskId)
            val photos = try {
                tasksApi.getPhotos(accessToken = accessToken, taskId = taskId)
                    .map { it.toTaskPhoto(baseUrl) }
            } catch (_: Throwable) {
                emptyList()
            }
            val mappedTask = detailDto.toTaskDetail(nowIso = nowIso)
                .copy(photos = photos)

            upsertTask(mappedTask)
            AppResult.Success(mappedTask)
        } catch (error: Throwable) {
            AppResult.Failure(error.toAppError())
        }
    }

    override suspend fun updateTaskStatus(
        taskId: Long,
        newStatus: TaskStatus,
        comment: String?,
    ): AppResult<TaskDetail> {
        val accessToken = sessionStore.read()?.accessToken
            ?: return AppResult.Failure(AppError.Unauthorized)

        return try {
            val mappedTask = tasksApi.updateTaskStatus(
                accessToken = accessToken,
                taskId = taskId,
                request = PortalStatusUpdateRequest(
                    status = newStatus.name,
                    comment = comment.orEmpty(),
                ),
            ).toTaskDetail()

            upsertTask(mappedTask)
            AppResult.Success(mappedTask)
        } catch (error: Throwable) {
            AppResult.Failure(error.toAppError())
        }
    }

    override suspend fun addTaskComment(
        taskId: Long,
        message: String,
    ): AppResult<TaskComment> {
        val accessToken = sessionStore.read()?.accessToken
            ?: return AppResult.Failure(AppError.Unauthorized)

        return try {
            val mappedComment = tasksApi.addComment(
                accessToken = accessToken,
                taskId = taskId,
                request = PortalCreateCommentRequest(text = message),
            ).toTaskComment()

            taskDetails.value[taskId]?.let { currentTask ->
                val updatedTask = currentTask.copy(
                    comments = currentTask.comments + mappedComment,
                )
                taskDetails.value = taskDetails.value + (taskId to updatedTask)
            }

            AppResult.Success(mappedComment)
        } catch (error: Throwable) {
            AppResult.Failure(error.toAppError())
        }
    }

    override suspend fun uploadPhoto(
        taskId: Long,
        fileName: String,
        fileBytes: ByteArray,
        mimeType: String,
    ): AppResult<TaskPhoto> {
        val accessToken = sessionStore.read()?.accessToken
            ?: return AppResult.Failure(AppError.Unauthorized)

        return try {
            val baseUrl = baseUrlProvider.getBaseUrl()
            val dto = tasksApi.uploadPhoto(
                accessToken = accessToken,
                taskId = taskId,
                fileName = fileName,
                fileBytes = fileBytes,
                mimeType = mimeType,
            )
            val photo = dto.toTaskPhoto(baseUrl)

            // Append photo to cached task detail
            taskDetails.value[taskId]?.let { currentTask ->
                val updatedTask = currentTask.copy(
                    photos = currentTask.photos + photo,
                )
                taskDetails.value = taskDetails.value + (taskId to updatedTask)
            }

            AppResult.Success(photo)
        } catch (error: Throwable) {
            AppResult.Failure(error.toAppError())
        }
    }

    private fun upsertTask(task: TaskDetail) {
        taskDetails.value = taskDetails.value + (task.id to task)

        val updatedSummaries = taskSummaries.value.toMutableList()
        val summary = task.toSummary()
        val existingIndex = updatedSummaries.indexOfFirst { item -> item.id == task.id }

        if (existingIndex >= 0) {
            updatedSummaries[existingIndex] = summary
        } else {
            updatedSummaries.add(summary)
        }

        taskSummaries.value = updatedSummaries
    }
}
