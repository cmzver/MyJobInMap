package com.fieldworker.ui.utils

import android.content.Context
import android.content.Intent
import android.location.Location
import android.net.Uri
import com.fieldworker.domain.model.Task
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import kotlin.math.*

/**
 * Утилиты для работы с задачами
 */
object TaskUtils {
    
    /**
     * Форматирует дату в относительный формат ("2 часа назад", "вчера", и т.д.)
     */
    fun formatRelativeTime(dateString: String): String {
        return try {
            // Пробуем разные форматы даты
            val dateTime = parseDateTime(dateString) ?: return dateString
            val now = LocalDateTime.now()
            val duration = Duration.between(dateTime, now)
            
            when {
                duration.toMinutes() < 1 -> "только что"
                duration.toMinutes() < 60 -> {
                    val minutes = duration.toMinutes().toInt()
                    "$minutes ${pluralize(minutes, "минуту", "минуты", "минут")} назад"
                }
                duration.toHours() < 24 -> {
                    val hours = duration.toHours().toInt()
                    "$hours ${pluralize(hours, "час", "часа", "часов")} назад"
                }
                duration.toDays() < 2 -> "вчера"
                duration.toDays() < 7 -> {
                    val days = duration.toDays().toInt()
                    "$days ${pluralize(days, "день", "дня", "дней")} назад"
                }
                else -> {
                    dateTime.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))
                }
            }
        } catch (e: Exception) {
            dateString
        }
    }
    
    /**
     * Парсит дату из строки
     */
    private fun parseDateTime(dateString: String): LocalDateTime? {
        val formatters = listOf(
            DateTimeFormatter.ISO_DATE_TIME,
            DateTimeFormatter.ISO_LOCAL_DATE_TIME,
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSS"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
        )
        
        for (formatter in formatters) {
            try {
                return LocalDateTime.parse(dateString.substringBefore("+").substringBefore("Z"), formatter)
            } catch (e: DateTimeParseException) {
                continue
            }
        }
        return null
    }
    
    /**
     * Форматирует дату в короткий формат для карточек (dd.MM.yyyy)
     */
    fun formatShortDate(dateString: String): String {
        return try {
            val dateTime = parseDateTime(dateString) ?: return dateString
            dateTime.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))
        } catch (e: Exception) {
            dateString
        }
    }
    
    /**
     * Склонение слов
     */
    private fun pluralize(count: Int, one: String, few: String, many: String): String {
        val n = abs(count) % 100
        return when {
            n in 11..19 -> many
            n % 10 == 1 -> one
            n % 10 in 2..4 -> few
            else -> many
        }
    }
    
    /**
     * Рассчитывает расстояние до задачи в метрах
     */
    fun calculateDistance(
        userLat: Double?,
        userLon: Double?,
        taskLat: Double?,
        taskLon: Double?
    ): Float? {
        if (userLat == null || userLon == null || taskLat == null || taskLon == null) {
            return null
        }
        
        val results = FloatArray(1)
        Location.distanceBetween(userLat, userLon, taskLat, taskLon, results)
        return results[0]
    }
    
    /**
     * Форматирует расстояние в читаемый вид
     */
    fun formatDistance(distanceMeters: Float?): String? {
        if (distanceMeters == null) return null
        
        return when {
            distanceMeters < 1000 -> "${distanceMeters.toInt()} м"
            distanceMeters < 10000 -> String.format("%.1f км", distanceMeters / 1000)
            else -> "${(distanceMeters / 1000).toInt()} км"
        }
    }
    
    /**
     * Открывает навигацию до задачи
     */
    fun openNavigation(context: Context, task: Task, preferYandex: Boolean = true) {
        if (task.lat == null || task.lon == null) return
        
        val lat = task.lat
        val lon = task.lon
        
        // Пробуем Яндекс.Карты
        if (preferYandex) {
            val yandexIntent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("yandexmaps://maps.yandex.ru/?rtext=~$lat,$lon&rtt=auto")
                setPackage("ru.yandex.yandexmaps")
            }
            if (yandexIntent.resolveActivity(context.packageManager) != null) {
                context.startActivity(yandexIntent)
                return
            }
            
            // Яндекс.Навигатор
            val navigatorIntent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("yandexnavi://build_route_on_map?lat_to=$lat&lon_to=$lon")
                setPackage("ru.yandex.yandexnavi")
            }
            if (navigatorIntent.resolveActivity(context.packageManager) != null) {
                context.startActivity(navigatorIntent)
                return
            }
        }
        
        // Google Maps
        val googleIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("google.navigation:q=$lat,$lon&mode=d")
            setPackage("com.google.android.apps.maps")
        }
        if (googleIntent.resolveActivity(context.packageManager) != null) {
            context.startActivity(googleIntent)
            return
        }
        
        // 2GIS
        val dgisIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("dgis://2gis.ru/routeSearch/rsType/car/to/$lon,$lat")
            setPackage("ru.dublgis.dgismobile")
        }
        if (dgisIntent.resolveActivity(context.packageManager) != null) {
            context.startActivity(dgisIntent)
            return
        }
        
        // Fallback на браузер
        val browserIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("https://yandex.ru/maps/?rtext=~$lat,$lon&rtt=auto")
        }
        context.startActivity(browserIntent)
    }
    
    /**
     * Открывает задачу на карте (без маршрута)
     */
    fun openOnMap(context: Context, task: Task) {
        if (task.lat == null || task.lon == null) return
        
        val lat = task.lat
        val lon = task.lon
        val label = Uri.encode(task.address)
        
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("geo:$lat,$lon?q=$lat,$lon($label)")
        }
        context.startActivity(Intent.createChooser(intent, "Открыть на карте"))
    }
}

/**
 * Enum для сортировки задач
 */
enum class TaskSortOrder(val displayName: String) {
    BY_DATE_DESC("По дате (новые)"),
    BY_DATE_ASC("По дате (старые)"),
    BY_DISTANCE("По расстоянию"),
    BY_PRIORITY_DESC("По приоритету ↓"),
    BY_PRIORITY_ASC("По приоритету ↑"),
    BY_STATUS("По статусу")
}

/**
 * Сортировка списка задач
 */
fun List<Task>.sortedBy(
    order: TaskSortOrder,
    userLat: Double? = null,
    userLon: Double? = null
): List<Task> {
    return when (order) {
        TaskSortOrder.BY_DATE_DESC -> this.sortedByDescending { it.createdAt }
        TaskSortOrder.BY_DATE_ASC -> this.sortedBy { it.createdAt }
        TaskSortOrder.BY_PRIORITY_DESC -> this.sortedByDescending { it.priority.value }
        TaskSortOrder.BY_PRIORITY_ASC -> this.sortedBy { it.priority.value }
        TaskSortOrder.BY_STATUS -> this.sortedBy { it.status.ordinal }
        TaskSortOrder.BY_DISTANCE -> {
            if (userLat != null && userLon != null) {
                this.sortedBy { task ->
                    TaskUtils.calculateDistance(userLat, userLon, task.lat, task.lon) ?: Float.MAX_VALUE
                }
            } else {
                this
            }
        }
    }
}
