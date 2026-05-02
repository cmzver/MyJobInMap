package com.fieldworker.ui.map

import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import kotlin.math.pow
import kotlin.math.roundToLong

internal data class TaskGroupSummary(
    val highestPriority: Priority,
    val newCount: Int,
    val inProgressCount: Int,
    val doneCount: Int,
    val cancelledCount: Int,
) {
    val activeCount: Int
        get() = newCount + inProgressCount
}

internal data class TaskMarkerGroup(
    val tasks: List<Task>,
    val lat: Double,
    val lon: Double,
) {
    init {
        require(tasks.isNotEmpty()) { "TaskMarkerGroup cannot be empty" }
    }

    val primaryTask: Task
        get() = tasks.first()

    val address: String
        get() = primaryTask.address

    val count: Int
        get() = tasks.size

    val isCluster: Boolean
        get() = count > 1

    val sortedTasks: List<Task>
        get() = tasks.sortedWith(taskMarkerGroupComparator)

    val summary: TaskGroupSummary
        get() = TaskGroupSummary(
            highestPriority = tasks.maxByOrNull(Task::priorityValue)?.priority ?: Priority.PLANNED,
            newCount = tasks.count { it.status == TaskStatus.NEW },
            inProgressCount = tasks.count { it.status == TaskStatus.IN_PROGRESS },
            doneCount = tasks.count { it.status == TaskStatus.DONE },
            cancelledCount = tasks.count { it.status == TaskStatus.CANCELLED },
        )
}

internal fun buildTaskMarkerGroups(tasks: List<Task>): List<TaskMarkerGroup> {
    val byAddress = tasks
        .filter(Task::hasValidCoordinates)
        .groupBy(::markerGroupingKey)
        .values

    val byCoords = LinkedHashMap<String, MutableList<Task>>()
    for (groupedTasks in byAddress) {
        val avgLat = groupedTasks.mapNotNull(Task::lat).average()
        val avgLon = groupedTasks.mapNotNull(Task::lon).average()
        val coordKey = "${avgLat.roundForGrouping(MERGE_DECIMALS)}:${avgLon.roundForGrouping(MERGE_DECIMALS)}"
        byCoords.getOrPut(coordKey) { mutableListOf() }.addAll(groupedTasks)
    }

    return byCoords.values.map { groupedTasks ->
        TaskMarkerGroup(
            tasks = groupedTasks,
            lat = groupedTasks.mapNotNull(Task::lat).average(),
            lon = groupedTasks.mapNotNull(Task::lon).average(),
        )
    }
}

private const val MERGE_DECIMALS = 4

private fun markerGroupingKey(task: Task): String {
    val normalizedAddress = task.address
        .trim()
        .lowercase()
        .replace(Regex("\\s+"), " ")

    return if (normalizedAddress.isNotBlank()) {
        "address:$normalizedAddress"
    } else {
        "coords:${task.lat.roundForGrouping()}:${task.lon.roundForGrouping()}"
    }
}

private fun Double?.roundForGrouping(decimals: Int = 5): Double {
    if (this == null) return 0.0
    val multiplier = 10.0.pow(decimals.toDouble())
    return (this * multiplier).roundToLong() / multiplier
}

private val taskMarkerGroupComparator =
    compareByDescending<Task> { it.priorityValue() }
        .thenBy { it.statusSortRank() }
        .thenByDescending(Task::createdAt)
        .thenBy(Task::id)

private fun Task.priorityValue(): Int = priority.value

private fun Task.statusSortRank(): Int = when (status) {
    TaskStatus.NEW -> 0
    TaskStatus.IN_PROGRESS -> 1
    TaskStatus.UNKNOWN -> 2
    TaskStatus.DONE -> 3
    TaskStatus.CANCELLED -> 4
}
