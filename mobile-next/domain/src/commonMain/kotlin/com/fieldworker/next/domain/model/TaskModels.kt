package com.fieldworker.next.domain.model

data class TaskSummary(
    val id: Long,
    val number: String,
    val title: String,
    val address: String,
    val lat: Double? = null,
    val lon: Double? = null,
    val status: TaskStatus,
    val priority: TaskPriority,
    val plannedLabel: String,
    val isOverdue: Boolean,
)

enum class TaskStatus(val label: String) {
    NEW("Новая"),
    IN_PROGRESS("В работе"),
    DONE("Завершена"),
    CANCELLED("Отменена"),
}

enum class TaskPriority(val sortOrder: Int, val label: String) {
    EMERGENCY(sortOrder = 0, label = "Аварийная"),
    URGENT(sortOrder = 1, label = "Срочная"),
    CURRENT(sortOrder = 2, label = "Текущая"),
    PLANNED(sortOrder = 3, label = "Плановая"),
}

data class TaskBoard(
    val focusTask: TaskSummary?,
    val needsAction: List<TaskSummary>,
    val inProgress: List<TaskSummary>,
    val activeCount: Int,
    val overdueCount: Int,
    val completedTodayCount: Int,
) {
    companion object {
        val EMPTY = TaskBoard(
            focusTask = null,
            needsAction = emptyList(),
            inProgress = emptyList(),
            activeCount = 0,
            overdueCount = 0,
            completedTodayCount = 0,
        )
    }
}
