package com.fieldworker.next.data.repository

import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskComment
import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.model.TaskPerson
import com.fieldworker.next.domain.model.TaskPhoto
import com.fieldworker.next.domain.model.TaskPriority
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.model.TaskSummary
import com.fieldworker.next.domain.model.toSummary
import com.fieldworker.next.domain.repository.TaskRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

class InMemoryTaskRepository : TaskRepository {
    private val tasks = MutableStateFlow(seedTasks())

    override fun observeAssignedTasks(): Flow<List<TaskSummary>> {
        return tasks.map { items -> items.map(TaskDetail::toSummary) }
    }

    override fun observeTaskDetail(taskId: Long): Flow<TaskDetail?> {
        return tasks.map { items -> items.firstOrNull { it.id == taskId } }
    }

    override suspend fun refreshAssignedTasks(): AppResult<List<TaskSummary>> {
        return AppResult.Success(tasks.value.map(TaskDetail::toSummary))
    }

    override suspend fun updateTaskStatus(
        taskId: Long,
        newStatus: TaskStatus,
        comment: String?,
    ): AppResult<TaskDetail> {
        val currentTask = tasks.value.firstOrNull { it.id == taskId }
            ?: return AppResult.Failure(AppError.NotFound(entity = "Task"))

        val newComments = buildList {
            add(
                TaskComment(
                    id = nextCommentId(),
                    author = "System",
                    message = "Status changed to $newStatus",
                    createdAtLabel = "Now",
                    isSystemEvent = true,
                )
            )
            if (!comment.isNullOrBlank()) {
                add(
                    TaskComment(
                        id = nextCommentId(offset = 1),
                        author = "Vadim Petrov",
                        message = comment,
                        createdAtLabel = "Now",
                        isSystemEvent = false,
                    )
                )
            }
        }

        val updatedTask = currentTask.copy(
            status = newStatus,
            comments = currentTask.comments + newComments,
            availableTransitions = transitionsFor(newStatus),
        )

        tasks.value = tasks.value.map { task ->
            if (task.id == taskId) updatedTask else task
        }

        return AppResult.Success(updatedTask)
    }

    override suspend fun addTaskComment(
        taskId: Long,
        message: String,
    ): AppResult<TaskComment> {
        val currentTask = tasks.value.firstOrNull { it.id == taskId }
            ?: return AppResult.Failure(AppError.NotFound(entity = "Task"))

        val newComment = TaskComment(
            id = nextCommentId(),
            author = "Vadim Petrov",
            message = message,
            createdAtLabel = "Now",
            isSystemEvent = false,
        )

        tasks.value = tasks.value.map { task ->
            if (task.id == taskId) {
                task.copy(comments = task.comments + newComment)
            } else {
                task
            }
        }

        return AppResult.Success(newComment)
    }

    override suspend fun uploadPhoto(
        taskId: Long,
        fileName: String,
        fileBytes: ByteArray,
        mimeType: String,
    ): AppResult<TaskPhoto> {
        val currentTask = tasks.value.firstOrNull { it.id == taskId }
            ?: return AppResult.Failure(AppError.NotFound(entity = "Task"))

        val photo = TaskPhoto(
            id = (currentTask.photos.maxOfOrNull(TaskPhoto::id) ?: 0L) + 1L,
            url = "local://$fileName",
            kind = mimeType,
            createdAtLabel = "Now",
        )

        tasks.value = tasks.value.map { task ->
            if (task.id == taskId) task.copy(photos = task.photos + photo) else task
        }

        return AppResult.Success(photo)
    }

    private fun nextCommentId(offset: Long = 0): Long {
        val maxId = tasks.value
            .flatMap(TaskDetail::comments)
            .maxOfOrNull(TaskComment::id)
            ?: 0L
        return maxId + 1L + offset
    }

    private fun transitionsFor(status: TaskStatus): List<TaskStatus> {
        return when (status) {
            TaskStatus.NEW -> listOf(TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED)
            TaskStatus.IN_PROGRESS -> listOf(TaskStatus.DONE, TaskStatus.CANCELLED)
            TaskStatus.DONE, TaskStatus.CANCELLED -> emptyList()
        }
    }

    private fun seedTasks(): List<TaskDetail> {
        return listOf(
            TaskDetail(
                id = 101,
                number = "1138996",
                title = "Entrance panel outage",
                address = "Lenina 14",
                description = "Restore intercom connectivity before end of shift.",
                status = TaskStatus.NEW,
                priority = TaskPriority.EMERGENCY,
                plannedLabel = "Overdue by 35 min",
                isOverdue = true,
                assignee = TaskPerson(name = "Vadim Petrov", phone = "+7 900 000-10-10"),
                customer = TaskPerson(name = "Dispatcher desk", phone = "+7 900 000-20-20"),
                systemLabel = "Intercom",
                defectLabel = "No response from panel",
                comments = listOf(
                    TaskComment(
                        id = 1,
                        author = "Dispatcher",
                        message = "Customer reported a full entrance outage.",
                        createdAtLabel = "Today 09:12",
                        isSystemEvent = false,
                    )
                ),
                photos = listOf(
                    TaskPhoto(
                        id = 1,
                        url = "",
                        kind = "before",
                        createdAtLabel = "Today 09:15",
                    )
                ),
                availableTransitions = listOf(TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED),
            ),
            TaskDetail(
                id = 102,
                number = "1139004",
                title = "Verify intercom and confirm report",
                address = "Mira 8",
                description = "Run final on-site check before portal closure.",
                status = TaskStatus.NEW,
                priority = TaskPriority.CURRENT,
                plannedLabel = "Today 14:30",
                isOverdue = false,
                assignee = TaskPerson(name = "Vadim Petrov", phone = "+7 900 000-10-10"),
                customer = TaskPerson(name = "Olga Smirnova", phone = "+7 900 000-20-21"),
                systemLabel = "Intercom",
                defectLabel = "Final verification",
                comments = emptyList(),
                photos = emptyList(),
                availableTransitions = listOf(TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED),
            ),
            TaskDetail(
                id = 103,
                number = "1139011",
                title = "Replace power supply unit",
                address = "Pobedy 21",
                description = "Replace PSU and leave execution note after startup.",
                status = TaskStatus.IN_PROGRESS,
                priority = TaskPriority.URGENT,
                plannedLabel = "Today 16:00",
                isOverdue = true,
                assignee = TaskPerson(name = "Vadim Petrov", phone = "+7 900 000-10-10"),
                customer = TaskPerson(name = "Sergey Ivanov", phone = "+7 900 000-20-22"),
                systemLabel = "Access control",
                defectLabel = "Power supply replacement",
                comments = listOf(
                    TaskComment(
                        id = 2,
                        author = "System",
                        message = "Status changed to IN_PROGRESS",
                        createdAtLabel = "Today 10:05",
                        isSystemEvent = true,
                    ),
                    TaskComment(
                        id = 3,
                        author = "Vadim Petrov",
                        message = "Cabinet is open, replacement started.",
                        createdAtLabel = "Today 10:09",
                        isSystemEvent = false,
                    )
                ),
                photos = listOf(
                    TaskPhoto(
                        id = 2,
                        url = "",
                        kind = "before",
                        createdAtLabel = "Today 10:04",
                    )
                ),
                availableTransitions = listOf(TaskStatus.DONE, TaskStatus.CANCELLED),
            ),
            TaskDetail(
                id = 104,
                number = "1139018",
                title = "Routine cabinet inspection",
                address = "Kirova 3",
                description = "Check fixture points, power, and labels.",
                status = TaskStatus.IN_PROGRESS,
                priority = TaskPriority.PLANNED,
                plannedLabel = "Today 18:30",
                isOverdue = false,
                assignee = TaskPerson(name = "Vadim Petrov", phone = "+7 900 000-10-10"),
                customer = null,
                systemLabel = "Access control",
                defectLabel = "Routine inspection",
                comments = emptyList(),
                photos = emptyList(),
                availableTransitions = listOf(TaskStatus.DONE, TaskStatus.CANCELLED),
            ),
            TaskDetail(
                id = 105,
                number = "1138969",
                title = "Finish photo evidence and close task",
                address = "Sovetskaya 12",
                description = "Final step before confirmation in the portal.",
                status = TaskStatus.DONE,
                priority = TaskPriority.CURRENT,
                plannedLabel = "Closed 11:20",
                isOverdue = false,
                assignee = TaskPerson(name = "Vadim Petrov", phone = "+7 900 000-10-10"),
                customer = TaskPerson(name = "Remote QA"),
                systemLabel = "Video surveillance",
                defectLabel = "Photo report completed",
                comments = listOf(
                    TaskComment(
                        id = 4,
                        author = "System",
                        message = "Status changed to DONE",
                        createdAtLabel = "Today 11:20",
                        isSystemEvent = true,
                    )
                ),
                photos = listOf(
                    TaskPhoto(
                        id = 3,
                        url = "",
                        kind = "completion",
                        createdAtLabel = "Today 11:18",
                    )
                ),
                availableTransitions = emptyList(),
            ),
        )
    }
}
