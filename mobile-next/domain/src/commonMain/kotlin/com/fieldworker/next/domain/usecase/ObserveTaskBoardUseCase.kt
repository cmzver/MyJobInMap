package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.TaskBoard
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.model.TaskSummary
import com.fieldworker.next.domain.repository.TaskRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class ObserveTaskBoardUseCase(
    private val repository: TaskRepository,
) {
    operator fun invoke(): Flow<TaskBoard> {
        return repository.observeAssignedTasks().map { tasks ->
            val sortedActiveTasks = tasks
                .filter { it.status == TaskStatus.NEW || it.status == TaskStatus.IN_PROGRESS }
                .sortedWith(
                    compareBy<TaskSummary> { it.priority.sortOrder }
                        .thenByDescending { it.isOverdue }
                        .thenBy { it.id }
                )

            val needsAction = sortedActiveTasks.filter { it.status == TaskStatus.NEW }
            val inProgress = sortedActiveTasks.filter { it.status == TaskStatus.IN_PROGRESS }

            TaskBoard(
                focusTask = sortedActiveTasks.firstOrNull(),
                needsAction = needsAction,
                inProgress = inProgress,
                activeCount = sortedActiveTasks.size,
                overdueCount = sortedActiveTasks.count(TaskSummary::isOverdue),
                completedTodayCount = tasks.count { it.status == TaskStatus.DONE },
            )
        }
    }
}
