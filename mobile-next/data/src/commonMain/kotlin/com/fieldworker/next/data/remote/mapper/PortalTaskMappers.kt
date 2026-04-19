package com.fieldworker.next.data.remote.mapper

import com.fieldworker.next.data.remote.PortalPayloadException
import com.fieldworker.next.data.remote.model.PortalCommentDto
import com.fieldworker.next.data.remote.model.PortalPhotoDto
import com.fieldworker.next.data.remote.model.PortalTaskDetailDto
import com.fieldworker.next.data.remote.model.PortalTaskListItemDto
import com.fieldworker.next.domain.model.TaskComment
import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.model.TaskPerson
import com.fieldworker.next.domain.model.TaskPhoto
import com.fieldworker.next.domain.model.TaskPriority
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.model.TaskSummary

fun PortalTaskListItemDto.toTaskSummary(nowIso: String? = null): TaskSummary {
    val mappedStatus = status.toDomainTaskStatus()
    return TaskSummary(
        id = id,
        number = taskNumber.orFallback("Z-$id"),
        title = title.ifBlank { "Task #$id" },
        address = rawAddress.orEmpty(),
        lat = lat,
        lon = lon,
        status = mappedStatus,
        priority = priority.toDomainTaskPriority(),
        plannedLabel = plannedLabel(plannedDate, completedAt),
        isOverdue = isOverdue(
            plannedDate = plannedDate,
            status = mappedStatus,
            nowIso = nowIso,
        ),
    )
}

fun PortalTaskDetailDto.toTaskDetail(nowIso: String? = null): TaskDetail {
    val mappedStatus = status.toDomainTaskStatus()
    return TaskDetail(
        id = id,
        number = taskNumber.orFallback("Z-$id"),
        title = title.ifBlank { "Task #$id" },
        address = rawAddress.orEmpty(),
        description = description.orEmpty(),
        status = mappedStatus,
        priority = priority.toDomainTaskPriority(),
        plannedLabel = plannedLabel(plannedDate, completedAt),
        isOverdue = isOverdue(
            plannedDate = plannedDate,
            status = mappedStatus,
            nowIso = nowIso,
        ),
        assignee = assignedUserName.toTaskPerson(phone = null),
        customer = customerName.toTaskPerson(phone = customerPhone),
        systemLabel = systemType.nullIfBlank(),
        defectLabel = defectType.nullIfBlank(),
        comments = comments.map { it.toTaskComment() },
        photos = emptyList(),
        availableTransitions = mappedStatus.availableTransitions(),
    )
}

fun PortalCommentDto.toTaskComment(): TaskComment {
    return TaskComment(
        id = id,
        author = author.ifBlank { "System" },
        message = buildCommentMessage(),
        createdAtLabel = createdAt.toCompactLabel(),
        isSystemEvent = isSystemEvent(),
    )
}

fun PortalPhotoDto.toTaskPhoto(baseUrl: String): TaskPhoto {
    return TaskPhoto(
        id = id,
        url = "$baseUrl$url",
        kind = photoType,
        createdAtLabel = createdAt.toCompactLabel(),
    )
}

private fun String.toDomainTaskStatus(): TaskStatus {
    return when (trim().uppercase()) {
        "NEW" -> TaskStatus.NEW
        "IN_PROGRESS" -> TaskStatus.IN_PROGRESS
        "DONE" -> TaskStatus.DONE
        "CANCELLED" -> TaskStatus.CANCELLED
        else -> throw PortalPayloadException("Unsupported task status: $this")
    }
}

private fun String?.toDomainTaskPriority(): TaskPriority {
    return when (this?.trim()?.uppercase()) {
        null, "" -> TaskPriority.PLANNED
        "PLANNED" -> TaskPriority.PLANNED
        "CURRENT" -> TaskPriority.CURRENT
        "URGENT" -> TaskPriority.URGENT
        "EMERGENCY" -> TaskPriority.EMERGENCY
        else -> throw PortalPayloadException("Unsupported task priority: $this")
    }
}

private fun TaskStatus.availableTransitions(): List<TaskStatus> {
    return when (this) {
        TaskStatus.NEW -> listOf(TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED)
        TaskStatus.IN_PROGRESS -> listOf(TaskStatus.DONE, TaskStatus.CANCELLED)
        TaskStatus.DONE, TaskStatus.CANCELLED -> emptyList()
    }
}

private fun isOverdue(
    plannedDate: String?,
    status: TaskStatus,
    nowIso: String?,
): Boolean {
    if (status == TaskStatus.DONE || status == TaskStatus.CANCELLED) {
        return false
    }

    val plannedKey = plannedDate.toComparableIsoKey() ?: return false
    val nowKey = nowIso.toComparableIsoKey() ?: return false

    return if (plannedKey.length == 10 || nowKey.length == 10) {
        plannedKey.take(10) < nowKey.take(10)
    } else {
        plannedKey < nowKey
    }
}

private fun plannedLabel(
    plannedDate: String?,
    completedAt: String?,
): String {
    completedAt.toCompactLabelOrNull()?.let { return "Closed $it" }
    plannedDate.toCompactLabelOrNull()?.let { return it }
    return "Unscheduled"
}

private fun PortalCommentDto.buildCommentMessage(): String {
    val directText = text.trim()
    if (directText.isNotEmpty()) {
        return directText
    }

    val oldStatusLabel = oldStatus.humanizeEnum()
    val newStatusLabel = newStatus.humanizeEnum()
    if (oldStatusLabel != null || newStatusLabel != null) {
        return when {
            oldStatusLabel != null && newStatusLabel != null -> {
                "Status: $oldStatusLabel -> $newStatusLabel"
            }

            newStatusLabel != null -> "Status: $newStatusLabel"
            else -> "Status updated"
        }
    }

    val oldAssigneeLabel = oldAssignee.nullIfBlank()
    val newAssigneeLabel = newAssignee.nullIfBlank()
    if (oldAssigneeLabel != null || newAssigneeLabel != null) {
        return when {
            oldAssigneeLabel != null && newAssigneeLabel != null -> {
                "Assignee: $oldAssigneeLabel -> $newAssigneeLabel"
            }

            newAssigneeLabel != null -> "Assigned to $newAssigneeLabel"
            else -> "Assignee updated"
        }
    }

    return "System update"
}

private fun PortalCommentDto.isSystemEvent(): Boolean {
    return !oldStatus.isNullOrBlank() ||
        !newStatus.isNullOrBlank() ||
        !oldAssignee.isNullOrBlank() ||
        !newAssignee.isNullOrBlank() ||
        author.equals("system", ignoreCase = true)
}

private fun String?.toTaskPerson(phone: String?): TaskPerson? {
    val resolvedName = this.nullIfBlank()
    val resolvedPhone = phone.nullIfBlank()
    if (resolvedName == null && resolvedPhone == null) {
        return null
    }

    return TaskPerson(
        name = resolvedName ?: resolvedPhone.orEmpty(),
        phone = resolvedPhone,
    )
}

private fun String?.orFallback(fallback: String): String {
    return this.nullIfBlank() ?: fallback
}

private fun String?.nullIfBlank(): String? {
    return this?.trim()?.takeIf { it.isNotEmpty() }
}

private fun String?.humanizeEnum(): String? {
    val rawValue = nullIfBlank() ?: return null
    return rawValue
        .lowercase()
        .split('_')
        .joinToString(" ") { part ->
            part.replaceFirstChar { char -> char.uppercaseChar() }
        }
}

private fun String?.toCompactLabelOrNull(): String? {
    val rawValue = nullIfBlank() ?: return null
    val cleaned = rawValue
        .removeSuffix("Z")
        .substringBefore('.')
        .replace('T', ' ')
        .trim()

    return when {
        cleaned.length >= 16 -> cleaned.take(16)
        cleaned.length >= 10 -> cleaned.take(10)
        cleaned.isNotEmpty() -> cleaned
        else -> null
    }
}

private fun String.toCompactLabel(): String {
    return toCompactLabelOrNull() ?: this
}

private fun String?.toComparableIsoKey(): String? {
    val compact = toCompactLabelOrNull() ?: return null
    return if (compact.length >= 16) {
        compact.replace(' ', 'T')
    } else {
        compact.take(10)
    }
}
