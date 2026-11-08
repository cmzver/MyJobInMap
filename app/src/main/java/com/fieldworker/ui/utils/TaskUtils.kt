package com.fieldworker.ui.utils

import android.content.Context
import android.content.Intent
import android.location.Location
import android.net.Uri
import com.fieldworker.domain.model.Task
import java.time.Duration
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import kotlin.math.*

/**
 * Утилиты для работы с задачами
 */
object TaskUtils {

    private val DATE_FORMATTERS = listOf(
        DateTimeFormatter.ISO_DATE_TIME,
        DateTimeFormatter.ISO_LOCAL_DATE_TIME,
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSS"),
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"),
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
        DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss"),
        DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"),
    )

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
     * Парсит дату из строки во время устройства.
     *
     * Метки сервера (created_at и т.п.) приходят в UTC с «Z» — их переводим
     * в пояс устройства; раньше «Z» просто отрезался, и комментарий в 12:00
     * по Москве показывался как 09:00. Значения без пояса (плановая дата)
     * — уже местное время, их берём как есть.
     */
    private fun parseDateTime(dateString: String): LocalDateTime? {
        try {
            return OffsetDateTime.parse(dateString)
                .atZoneSameInstant(ZoneId.systemDefault())
                .toLocalDateTime()
        } catch (e: DateTimeParseException) {
            // без пояса — разбираем ниже
        }
        for (formatter in DATE_FORMATTERS) {
            try {
                return LocalDateTime.parse(dateString, formatter)
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
     * Компактная дата для ленты (заявки уже сгруппированы по дням): сегодня —
     * время, текущий год — «28.10», иначе — «28.10.25».
     */
    fun formatCompactDate(dateString: String, today: java.time.LocalDate = java.time.LocalDate.now()): String {
        val dateTime = parseDateTime(dateString) ?: return dateString
        val pattern = when {
            dateTime.toLocalDate() == today -> "HH:mm"
            dateTime.year == today.year -> "dd.MM"
            else -> "dd.MM.yy"
        }
        return dateTime.format(DateTimeFormatter.ofPattern(pattern))
    }

    /** «07.11.2026 12:00» во времени устройства; нераспознанное — как есть. */
    fun formatDateTime(dateString: String): String =
        parseDateTime(dateString)?.format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
            ?: dateString

    fun formatShortTime(dateString: String): String {
        return try {
            val dateTime = parseDateTime(dateString) ?: return ""
            dateTime.format(DateTimeFormatter.ofPattern("HH:mm"))
        } catch (e: Exception) {
            ""
        }
    }

    /** Момент с сервера (UTC с «Z» или со смещением) во времени устройства. */
    fun parseMoment(value: String?): LocalDateTime? {
        if (value.isNullOrBlank()) return null
        return parseDateTime(value)
    }

    fun isMomentPast(value: String?, now: LocalDateTime = LocalDateTime.now()): Boolean =
        parseMoment(value)?.isBefore(now) ?: false

    /** Срок для ленты: «сегодня 18:00», «завтра 09:00», «05.11 18:00». */
    fun formatDue(value: String, now: LocalDateTime = LocalDateTime.now()): String {
        val moment = parseMoment(value) ?: return value
        val time = moment.format(DateTimeFormatter.ofPattern("HH:mm"))
        return when (moment.toLocalDate()) {
            now.toLocalDate() -> "сегодня $time"
            now.toLocalDate().plusDays(1) -> "завтра $time"
            now.toLocalDate().minusDays(1) -> "вчера $time"
            else -> moment.format(DateTimeFormatter.ofPattern("dd.MM HH:mm"))
        }
    }

    fun isDateOverdue(dateString: String?): Boolean {
        if (dateString.isNullOrBlank()) return false
        val dateTime = parseDateTime(dateString) ?: return false
        return dateTime.toLocalDate().isBefore(java.time.LocalDate.now())
    }

    enum class DateBucket(val label: String, val order: Int) {
        TODAY("Сегодня", 0),
        YESTERDAY("Вчера", 1),
        THIS_WEEK("Эта неделя", 2),
        THIS_MONTH("Этот месяц", 3),
        OLDER("Старее", 4),
        UNKNOWN("Без даты", 5),
    }

    fun pluralizeTasks(count: Int): String =
        pluralize(count, "заявка", "заявки", "заявок")

    fun dateBucket(dateString: String?): DateBucket {
        if (dateString.isNullOrBlank()) return DateBucket.UNKNOWN
        val dateTime = parseDateTime(dateString) ?: return DateBucket.UNKNOWN
        val date = dateTime.toLocalDate()
        val today = java.time.LocalDate.now()
        return when {
            date.isEqual(today) -> DateBucket.TODAY
            date.isEqual(today.minusDays(1)) -> DateBucket.YESTERDAY
            date.isAfter(today.minusDays(7)) -> DateBucket.THIS_WEEK
            date.isAfter(today.minusDays(30)) -> DateBucket.THIS_MONTH
            else -> DateBucket.OLDER
        }
    }
    
    /**
     * Склонение слов
     */
    fun pluralize(count: Int, one: String, few: String, many: String): String {
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
            // Запятая, как принято по-русски, при любом языке телефона
            distanceMeters < 10000 -> String.format(Locale.forLanguageTag("ru"), "%.1f км", distanceMeters / 1000)
            else -> "${(distanceMeters / 1000).toInt()} км"
        }
    }
    
    /** Яндекс строит маршрут не больше чем по стольким точкам */
    const val MAX_ROUTE_STOPS = 10

    /**
     * Маршрут по нескольким заявкам по порядку — одной поездкой от текущего
     * места (пустая первая точка rtext). Яндекс.Карты, иначе — их сайт
     * (откроется в браузере или в приложении). Без координат точки пропускаются.
     * Возвращает число точек в маршруте.
     */
    fun openRoute(context: Context, stops: List<Task>): Int {
        val points = stops.filter { it.lat != null && it.lon != null }.take(MAX_ROUTE_STOPS)
        if (points.isEmpty()) return 0
        val rtext = points.joinToString(separator = "~", prefix = "~") { "${it.lat},${it.lon}" }
        val appIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("yandexmaps://maps.yandex.ru/?rtext=$rtext&rtt=auto")
            setPackage("ru.yandex.yandexmaps")
        }
        val intent = if (appIntent.resolveActivity(context.packageManager) != null) {
            appIntent
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse("https://yandex.ru/maps/?rtext=$rtext&rtt=auto"))
        }
        runCatching { context.startActivity(intent) }
        return points.size
    }

    /**
     * Маршрут до заявки: Яндекс.Карты → Навигатор → Google Maps → 2ГИС → сайт.
     * Без координат (или с нулевыми) — поиск адреса в картах. false — открыть
     * нечем (раньше последний вариант падал ActivityNotFoundException).
     */
    fun openNavigation(context: Context, task: Task, preferYandex: Boolean = true): Boolean {
        if (!task.hasValidCoordinates()) return openAddressSearch(context, task.address)
        val lat = task.lat
        val lon = task.lon

        // Пробуем Яндекс.Карты и Яндекс.Навигатор
        if (preferYandex) {
            val yandexIntent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("yandexmaps://maps.yandex.ru/?rtext=~$lat,$lon&rtt=auto")
                setPackage("ru.yandex.yandexmaps")
            }
            if (startIfResolvable(context, yandexIntent)) return true

            val navigatorIntent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("yandexnavi://build_route_on_map?lat_to=$lat&lon_to=$lon")
                setPackage("ru.yandex.yandexnavi")
            }
            if (startIfResolvable(context, navigatorIntent)) return true
        }

        val googleIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("google.navigation:q=$lat,$lon&mode=d")
            setPackage("com.google.android.apps.maps")
        }
        if (startIfResolvable(context, googleIntent)) return true

        val dgisIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("dgis://2gis.ru/routeSearch/rsType/car/to/$lon,$lat")
            setPackage("ru.dublgis.dgismobile")
        }
        if (startIfResolvable(context, dgisIntent)) return true

        // Fallback на браузер
        return tryStart(context, Intent(Intent.ACTION_VIEW, Uri.parse("https://yandex.ru/maps/?rtext=~$lat,$lon&rtt=auto")))
    }

    /** Поиск адреса в любом приложении карт, иначе — на сайте Яндекс.Карт. */
    fun openAddressSearch(context: Context, address: String): Boolean {
        if (address.isBlank()) return false
        val query = Uri.encode(address)
        return tryStart(context, Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=$query"))) ||
            tryStart(context, Intent(Intent.ACTION_VIEW, Uri.parse("https://yandex.ru/maps/?text=$query")))
    }

    private fun startIfResolvable(context: Context, intent: Intent): Boolean =
        intent.resolveActivity(context.packageManager) != null && tryStart(context, intent)

    private fun tryStart(context: Context, intent: Intent): Boolean =
        runCatching { context.startActivity(intent) }.isSuccess

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
    BY_STATUS("По статусу"),
    BY_DUE("По сроку")
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
        // Горящие сверху; без срока — в конце
        TaskSortOrder.BY_DUE -> this.sortedWith(
            compareBy<Task>({ it.dueAt == null }, { TaskUtils.parseMoment(it.dueAt) })
        )
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

fun extractPhoneNumber(text: String): String? {
    val phoneRegex = Regex("""\+?[78]\d{10}""")
    return phoneRegex.find(text)?.value
}

fun extractApartment(text: String): String? {
    val aptRegex = Regex("""(?:кв\.?\s*|квартира\s*)(\d+)""", RegexOption.IGNORE_CASE)
    return aptRegex.find(text)?.groupValues?.get(1)
}

fun extractAdditionalInfo(task: Task): String? {
    val description = task.description
    if (description.isBlank()) return null
    var info = description
        .replace(Regex("""(?:тел(?:ефон)?\.?\s*:?\s*)?\+?[78]\d{10}""", RegexOption.IGNORE_CASE), "")
        .replace(Regex("""(?:кв\.?\s*|квартира\s*)\d+""", RegexOption.IGNORE_CASE), "")
        .replace(Regex("""\s*,\s*,\s*"""), ", ")
        .replace(Regex("""^\s*,\s*"""), "")
        .replace(Regex("""\s*,\s*$"""), "")
        .trim()
        .trimEnd(',', ';', ':')
        .trim()
    return info.ifBlank { null }
}

/** «+79219876543» → «+7 921 987-65-43»; нестандартные номера — как есть. */
fun formatPhoneForDisplay(phone: String): String {
    val normalized = normalizePhoneForDial(phone)
    val m = Regex("""^\+7(\d{3})(\d{3})(\d{2})(\d{2})$""").find(normalized) ?: return normalized
    val (code, a, b, c) = m.destructured
    return "+7 $code $a-$b-$c"
}

fun normalizePhoneForDial(phone: String): String {
    val compact = phone.replace(Regex("""[^+\d]"""), "")
    return when {
        compact.startsWith("8") && compact.length == 11 -> "+7${compact.drop(1)}"
        compact.startsWith("+") -> compact
        compact.isNotBlank() -> "+$compact"
        else -> compact
    }
}

/** Открыть набор номера (без звонка — пользователь подтверждает сам). */
fun dialPhone(context: android.content.Context, phone: String) {
    runCatching {
        context.startActivity(
            android.content.Intent(
                android.content.Intent.ACTION_DIAL,
                android.net.Uri.parse("tel:${normalizePhoneForDial(phone)}"),
            ),
        )
    }
}
