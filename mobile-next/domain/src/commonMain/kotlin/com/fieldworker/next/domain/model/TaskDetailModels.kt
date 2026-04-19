package com.fieldworker.next.domain.model

data class TaskPerson(
    val name: String,
    val phone: String? = null,
)

data class TaskComment(
    val id: Long,
    val author: String,
    val message: String,
    val createdAtLabel: String,
    val isSystemEvent: Boolean,
)

data class TaskPhoto(
    val id: Long,
    val url: String,
    val kind: String,
    val createdAtLabel: String,
)

data class TaskDetail(
    val id: Long,
    val number: String,
    val title: String,
    val address: String,
    val description: String,
    val status: TaskStatus,
    val priority: TaskPriority,
    val plannedLabel: String,
    val isOverdue: Boolean,
    val assignee: TaskPerson?,
    val customer: TaskPerson?,
    val systemLabel: String?,
    val defectLabel: String?,
    val comments: List<TaskComment>,
    val photos: List<TaskPhoto>,
    val availableTransitions: List<TaskStatus>,
)

fun TaskDetail.toSummary(): TaskSummary {
    return TaskSummary(
        id = id,
        number = number,
        title = title,
        address = address,
        lat = null,
        lon = null,
        status = status,
        priority = priority,
        plannedLabel = plannedLabel,
        isOverdue = isOverdue,
    )
}
