package com.fieldworker.ui.day

import androidx.compose.ui.graphics.Color
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.utils.TaskUtils
import com.fieldworker.ui.utils.priorityColor
import com.fieldworker.ui.utils.statusColor
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

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

/**
 * Цвет номера точки — тот же, что у точки «Маршрута дня» на карте: красный у
 * активной аварийной (единственный красный сигнал), иначе — цвет статуса.
 */
fun dayStopColor(task: Task): Color =
    if (task.priority == Priority.EMERGENCY && task.status in OPEN_STATUSES) {
        priorityColor(Priority.EMERGENCY)
    } else {
        statusColor(task.status)
    }

/**
 * Порядок, переставленный без связи, поверх списка дня с сервера: свои
 * перестановки сохраняем, снятые с дня заявки выкидываем, новые — в конец.
 */
fun mergeDayOrder(local: List<Long>, server: List<Long>): List<Long> {
    val onServer = server.toSet()
    val kept = local.filter { it in onServer }.distinct()
    val keptSet = kept.toSet()
    return kept + server.filterNot { it in keptSet }
}

/** Подпись плана у точки дня; [overdue] — план был на прошлый день. */
data class DayStopPlan(val text: String, val overdue: Boolean)

/**
 * «план на 10:00» — время, если оно задано; «просрочено, план 07.11» — если
 * план был раньше [day]. План на сегодня без времени не подписываем: в «Моём
 * дне» и так всё на сегодня.
 */
fun dayStopPlan(plannedDate: String?, day: String): DayStopPlan? {
    val planned = plannedDate?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val today = runCatching { LocalDate.parse(day) }.getOrNull() ?: return null
    val moment = TaskUtils.parseMoment(planned)
    val date = moment?.toLocalDate()
        ?: runCatching { LocalDate.parse(planned.take(10)) }.getOrNull()
        ?: return null
    if (date.isBefore(today)) {
        return DayStopPlan("просрочено, план ${date.format(SHORT_DATE)}", overdue = true)
    }
    val time = moment?.toLocalTime()?.takeIf { it != LocalTime.MIDNIGHT } ?: return null
    return DayStopPlan("план на ${time.format(SHORT_TIME)}", overdue = false)
}

/** «воскресенье, 8 ноября · 3 выезда» — подзаголовок «Моего дня». */
fun myDaySubtitle(day: String, stops: Int?): String {
    val date = runCatching { LocalDate.parse(day) }.getOrNull()
    // Месяц — в родительном падеже вручную: java.time на Android для «d MMMM»
    // отдаёт именительный («8 ноябрь»)
    val dateText = date?.let { "${it.format(WEEKDAY)}, ${it.dayOfMonth} ${MONTHS_GENITIVE[it.monthValue - 1]}" } ?: day
    if (stops == null || stops == 0) return dateText
    return "$dateText · $stops ${TaskUtils.pluralize(stops, "выезд", "выезда", "выездов")}"
}

private val OPEN_STATUSES = setOf(TaskStatus.NEW, TaskStatus.IN_PROGRESS)
private val RU = Locale.forLanguageTag("ru")
private val WEEKDAY = DateTimeFormatter.ofPattern("EEEE", RU)
private val MONTHS_GENITIVE = listOf(
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)
private val SHORT_DATE = DateTimeFormatter.ofPattern("dd.MM")
private val SHORT_TIME = DateTimeFormatter.ofPattern("HH:mm")
