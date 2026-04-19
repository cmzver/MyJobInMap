package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskComment
import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.model.TaskPriority
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.model.TaskSummary
import com.fieldworker.next.domain.repository.TaskRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class ObserveTaskBoardUseCaseTest {
    @Test
    fun groupsActiveTasksAndPicksFocusByPriority() = runBlocking {
        val repository = object : TaskRepository {
            override fun observeAssignedTasks(): Flow<List<TaskSummary>> {
                return flowOf(
                    listOf(
                        task(
                            id = 1,
                            number = "100241",
                            priority = TaskPriority.CURRENT,
                            status = TaskStatus.NEW,
                            isOverdue = false,
                        ),
                        task(
                            id = 2,
                            number = "100199",
                            priority = TaskPriority.EMERGENCY,
                            status = TaskStatus.NEW,
                            isOverdue = true,
                        ),
                        task(
                            id = 3,
                            number = "100177",
                            priority = TaskPriority.URGENT,
                            status = TaskStatus.IN_PROGRESS,
                            isOverdue = true,
                        ),
                        task(
                            id = 4,
                            number = "100102",
                            priority = TaskPriority.PLANNED,
                            status = TaskStatus.DONE,
                            isOverdue = false,
                        ),
                    )
                )
            }

            override fun observeTaskDetail(taskId: Long): Flow<TaskDetail?> = emptyFlow()
            override suspend fun updateTaskStatus(taskId: Long, newStatus: TaskStatus, comment: String?): AppResult<TaskDetail> = AppResult.Failure(AppError.Network("stub"))
            override suspend fun addTaskComment(taskId: Long, message: String): AppResult<TaskComment> = AppResult.Failure(AppError.Network("stub"))
        }

        val board = ObserveTaskBoardUseCase(repository).invoke().first()

        assertEquals("100199", board.focusTask?.number)
        assertEquals(3, board.activeCount)
        assertEquals(2, board.overdueCount)
        assertEquals(1, board.completedTodayCount)
        assertEquals(listOf("100199", "100241"), board.needsAction.map(TaskSummary::number))
        assertEquals(listOf("100177"), board.inProgress.map(TaskSummary::number))
    }

    private fun task(
        id: Long,
        number: String,
        priority: TaskPriority,
        status: TaskStatus,
        isOverdue: Boolean,
    ) = TaskSummary(
        id = id,
        number = number,
        title = "Task $number",
        address = "Test address",
        status = status,
        priority = priority,
        plannedLabel = "Сегодня 14:00",
        isOverdue = isOverdue,
    )
}
