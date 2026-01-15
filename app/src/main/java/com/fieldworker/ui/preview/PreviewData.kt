package com.fieldworker.ui.preview

import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Тестовые данные для Preview в Android Studio
 */
object PreviewData {
    
    private val now = LocalDateTime.now()
    private val formatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME
    
    val sampleTasks = listOf(
        Task(
            id = 1,
            taskNumber = "[1138996]",
            title = "№1138996 Аварийная ГВС - нет горячей воды",
            address = "Ленинский проспект, д.82, корп.3, кв.45",
            description = "Нет горячей воды в квартире. Телефон: +79219876543",
            lat = 59.8525,
            lon = 30.2678,
            status = TaskStatus.NEW,
            priority = Priority.EMERGENCY,
            createdAt = now.minusHours(1).format(formatter),
            updatedAt = now.minusMinutes(30).format(formatter),
            commentsCount = 2
        ),
        Task(
            id = 2,
            taskNumber = "[1138997]",
            title = "№1138997 Срочная ХВС - слабый напор воды",
            address = "пр. Стачек, д.15, кв.12",
            description = "Слабый напор холодной воды на 5 этаже",
            lat = 59.8789,
            lon = 30.2534,
            status = TaskStatus.IN_PROGRESS,
            priority = Priority.URGENT,
            createdAt = now.minusHours(3).format(formatter),
            updatedAt = now.minusHours(1).format(formatter),
            commentsCount = 5
        ),
        Task(
            id = 3,
            taskNumber = "[1138998]",
            title = "№1138998 Текущая - проверка счётчиков",
            address = "ул. Маршала Казакова, д.28, кв.78",
            description = "Плановая проверка счётчиков воды",
            lat = 59.8456,
            lon = 30.2123,
            status = TaskStatus.NEW,
            priority = Priority.CURRENT,
            createdAt = now.minusDays(1).format(formatter),
            updatedAt = now.minusDays(1).format(formatter),
            commentsCount = 0
        ),
        Task(
            id = 4,
            taskNumber = "Z-00004",
            title = "Плановая замена стояка ГВС",
            address = "Балтийская ул., д.5, кв.23",
            description = "Замена стояка горячего водоснабжения по плану",
            lat = 59.9012,
            lon = 30.2345,
            status = TaskStatus.DONE,
            priority = Priority.PLANNED,
            createdAt = now.minusDays(3).format(formatter),
            updatedAt = now.minusHours(5).format(formatter),
            commentsCount = 3
        ),
        Task(
            id = 5,
            taskNumber = "[1139000]",
            title = "№1139000 Аварийная - прорыв трубы",
            address = "Краснопутиловская ул., д.12",
            description = "Прорыв трубы в подвале, затопление",
            lat = 59.8678,
            lon = 30.2890,
            status = TaskStatus.IN_PROGRESS,
            priority = Priority.EMERGENCY,
            createdAt = now.minusMinutes(30).format(formatter),
            updatedAt = now.minusMinutes(10).format(formatter),
            commentsCount = 8
        )
    )
    
    val sampleComments = listOf(
        Comment(
            id = 1,
            taskId = 1,
            text = "Выехал на адрес",
            author = "Иванов И.И.",
            oldStatus = TaskStatus.NEW,
            newStatus = TaskStatus.IN_PROGRESS,
            createdAt = now.minusMinutes(45).format(formatter),
            isStatusChange = true
        ),
        Comment(
            id = 2,
            taskId = 1,
            text = "На месте, начинаю диагностику",
            author = "Иванов И.И.",
            oldStatus = null,
            newStatus = null,
            createdAt = now.minusMinutes(30).format(formatter),
            isStatusChange = false
        ),
        Comment(
            id = 3,
            taskId = 1,
            text = "Обнаружена течь на стояке ГВС, требуется замена участка трубы",
            author = "Иванов И.И.",
            oldStatus = null,
            newStatus = null,
            createdAt = now.minusMinutes(15).format(formatter),
            isStatusChange = false
        )
    )
    
    val singleTask = sampleTasks.first()
    
    val taskNew = sampleTasks.find { it.status == TaskStatus.NEW }!!
    val taskInProgress = sampleTasks.find { it.status == TaskStatus.IN_PROGRESS }!!
    val taskDone = sampleTasks.find { it.status == TaskStatus.DONE }!!
    
    val taskEmergency = sampleTasks.find { it.priority == Priority.EMERGENCY }!!
    val taskUrgent = sampleTasks.find { it.priority == Priority.URGENT }!!
    val taskCurrent = sampleTasks.find { it.priority == Priority.CURRENT }!!
    val taskPlanned = sampleTasks.find { it.priority == Priority.PLANNED }!!
}
