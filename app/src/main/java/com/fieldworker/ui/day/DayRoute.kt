package com.fieldworker.ui.day

import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus

/**
 * Заявки «Моего дня» в порядке объезда: мои открытые, запланированные на
 * сегодня или раньше (и без даты). [order] — сохранённый порядок дня (id),
 * остальные — по плановой дате. Общий для экрана дня и карты, чтобы номера
 * точек на карте совпадали со списком.
 */
fun dayRouteTasks(tasks: List<Task>, order: List<Long>, day: String, userId: Long): List<Task> {
    val ranks = order.withIndex().associate { it.value to it.index }
    return tasks.filter { task ->
        task.assignedUserId == userId &&
            task.status in OPEN_STATUSES &&
            (task.plannedDate == null || task.plannedDate.take(10) <= day)
    }.sortedWith(
        compareBy<Task> { ranks[it.id] ?: Int.MAX_VALUE }
            .thenBy { it.plannedDate ?: "9999" }
            .thenBy { it.id }
    )
}

private val OPEN_STATUSES = setOf(TaskStatus.NEW, TaskStatus.IN_PROGRESS)
