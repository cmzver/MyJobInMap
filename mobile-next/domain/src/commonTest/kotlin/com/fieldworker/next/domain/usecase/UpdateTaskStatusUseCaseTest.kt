package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskComment
import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.model.TaskPerson
import com.fieldworker.next.domain.model.TaskPhoto
import com.fieldworker.next.domain.model.TaskPriority
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.model.TaskSummary
import com.fieldworker.next.domain.repository.TaskRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class UpdateTaskStatusUseCaseTest {
    @Test
    fun requiresCommentForDoneStatus() = runBlocking {
        val useCase = UpdateTaskStatusUseCase(FakeTaskRepository())

        val result = useCase(
            taskId = 1L,
            newStatus = TaskStatus.DONE,
            comment = " ",
        )

        val error = assertIs<AppResult.Failure>(result).error
        assertEquals(
            AppError.Validation(message = "Comment is required for status DONE"),
            error,
        )
    }

    @Test
    fun delegatesStatusUpdateWhenCommentIsValid() = runBlocking {
        val useCase = UpdateTaskStatusUseCase(FakeTaskRepository())

        val result = useCase(
            taskId = 1L,
            newStatus = TaskStatus.DONE,
            comment = "Completed with final report",
        )

        val detail = assertIs<AppResult.Success<TaskDetail>>(result).value
        assertEquals(TaskStatus.DONE, detail.status)
        assertEquals(2, detail.comments.size)
    }

    private class FakeTaskRepository : TaskRepository {
        private val detail = TaskDetail(
            id = 1L,
            number = "100100",
            title = "Test task",
            address = "Test address",
            description = "Description",
            status = TaskStatus.IN_PROGRESS,
            priority = TaskPriority.CURRENT,
            plannedLabel = "Today 15:00",
            isOverdue = false,
            assignee = TaskPerson(name = "Worker"),
            customer = null,
            systemLabel = "Intercom",
            defectLabel = "Test issue",
            comments = listOf(
                TaskComment(
                    id = 1L,
                    author = "Worker",
                    message = "Started work",
                    createdAtLabel = "Today 14:00",
                    isSystemEvent = false,
                )
            ),
            photos = listOf(
                TaskPhoto(
                    id = 1L,
                    url = "",
                    kind = "before",
                    createdAtLabel = "Today 14:01",
                )
            ),
            availableTransitions = listOf(TaskStatus.DONE, TaskStatus.CANCELLED),
        )

        override fun observeAssignedTasks(): Flow<List<TaskSummary>> = flowOf(emptyList())

        override fun observeTaskDetail(taskId: Long): Flow<TaskDetail?> = flowOf(detail)

        override suspend fun updateTaskStatus(
            taskId: Long,
            newStatus: TaskStatus,
            comment: String?,
        ): AppResult<TaskDetail> {
            return AppResult.Success(
                detail.copy(
                    status = newStatus,
                    comments = detail.comments + TaskComment(
                        id = 2L,
                        author = "Worker",
                        message = comment.orEmpty(),
                        createdAtLabel = "Now",
                        isSystemEvent = false,
                    )
                )
            )
        }

        override suspend fun addTaskComment(
            taskId: Long,
            message: String,
        ): AppResult<TaskComment> {
            return AppResult.Success(
                TaskComment(
                    id = 2L,
                    author = "Worker",
                    message = message,
                    createdAtLabel = "Now",
                    isSystemEvent = false,
                )
            )
        }
    }
}
