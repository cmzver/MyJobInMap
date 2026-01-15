package com.fieldworker.domain.model

/**
 * Domain модель задачи.
 * Используется в UI и бизнес-логике.
 */
data class Task(
    val id: Long,
    val taskNumber: String,
    val title: String,
    val address: String,
    val description: String,
    val lat: Double?,
    val lon: Double?,
    val status: TaskStatus,
    val priority: Priority,
    val createdAt: String,
    val updatedAt: String,
    val plannedDate: String? = null,
    val commentsCount: Int = 0
) {
    /**
     * Проверяет, есть ли у задачи валидные координаты для отображения на карте
     */
    fun hasValidCoordinates(): Boolean {
        return lat != null && lon != null && lat != 0.0 && lon != 0.0
    }
    
    /**
     * Извлекает номер заявки из диспетчерской системы (без скобок и префикса Z-)
     * Примеры:
     * - "[1138996]" -> "1138996"
     * - "Z-00001" -> null (это внутренний номер)
     * - "1138996" -> "1138996"
     */
    fun getDispatcherNumber(): String? {
        // Убираем квадратные скобки
        val cleaned = taskNumber.trim('[', ']', ' ')
        
        // Если это внутренний номер (Z-...), возвращаем null
        if (cleaned.startsWith("Z-", ignoreCase = true)) {
            return null
        }
        
        // Если это число, возвращаем его
        if (cleaned.all { it.isDigit() }) {
            return cleaned
        }
        
        // Пробуем извлечь номер из title (формат "№1138996 Плановая...")
        val regex = Regex("""№\s*(\d+)""")
        val match = regex.find(title)
        return match?.groupValues?.get(1)
    }
    
    /**
     * Возвращает внутренний номер заявки (Z-00001)
     * Если taskNumber не начинается с Z-, генерирует из id
     */
    fun getInternalNumber(): String {
        val cleaned = taskNumber.trim('[', ']', ' ')
        return if (cleaned.startsWith("Z-", ignoreCase = true)) {
            cleaned
        } else {
            "Z-${id.toString().padStart(5, '0')}"
        }
    }
    
    /**
     * Возвращает отображаемый номер для списка заявок
     * Приоритет: номер диспетчера, иначе внутренний номер
     */
    fun getDisplayNumber(): String {
        return getDispatcherNumber() ?: getInternalNumber()
    }
}

/**
 * Статусы задачи
 */
enum class TaskStatus(val displayName: String) {
    NEW("Новая"),
    IN_PROGRESS("В работе"),
    DONE("Выполнена"),
    CANCELLED("Отменена"),
    UNKNOWN("Неизвестно");
    
    companion object {
        fun fromString(status: String): TaskStatus {
            return when (status.uppercase()) {
                "NEW" -> NEW
                "IN_PROGRESS" -> IN_PROGRESS
                "DONE" -> DONE
                "CANCELLED" -> CANCELLED
                else -> UNKNOWN
            }
        }
    }
}

/**
 * Приоритет задачи
 * Соответствует приоритетам из системы заявок: Плановая, Текущая, Срочная, Аварийная
 */
enum class Priority(val value: Int, val displayName: String) {
    PLANNED(1, "Плановая"),     // Плановая заявка
    CURRENT(2, "Текущая"),       // Текущая заявка
    URGENT(3, "Срочная"),        // Срочная заявка
    EMERGENCY(4, "Аварийная");   // Аварийная заявка
    
    companion object {
        fun fromInt(value: Int): Priority {
            return when (value) {
                1 -> PLANNED
                2 -> CURRENT
                3 -> URGENT
                4 -> EMERGENCY
                else -> PLANNED // По умолчанию плановая
            }
        }
        
        /**
         * Парсит приоритет из текста заявки
         */
        fun fromText(text: String): Priority {
            val lowerText = text.lowercase()
            return when {
                "аварийн" in lowerText -> EMERGENCY
                "срочн" in lowerText -> URGENT
                "текущ" in lowerText -> CURRENT
                "планов" in lowerText -> PLANNED
                else -> PLANNED
            }
        }
    }
}

/**
 * Модель комментария
 */
data class Comment(
    val id: Long,
    val taskId: Long,
    val text: String,
    val author: String,
    val oldStatus: TaskStatus?,
    val newStatus: TaskStatus?,
    val createdAt: String,
    val isStatusChange: Boolean = oldStatus != null || newStatus != null
)

/**
 * Модель фотографии заявки
 */
data class TaskPhoto(
    val id: Long,
    val taskId: Long,
    val filename: String,
    val originalName: String?,
    val fileSize: Int,
    val mimeType: String,
    val photoType: String,  // "before", "after", "completion"
    val url: String,
    val createdAt: String,
    val uploadedBy: String?
) {
    /**
     * Получить полный URL для загрузки фото
     */
    fun getFullUrl(baseUrl: String): String {
        return if (url.startsWith("http")) url else "$baseUrl$url"
    }
    
    /**
     * Отображаемое название типа фото
     */
    fun getPhotoTypeDisplayName(): String {
        return when (photoType) {
            "before" -> "До работ"
            "after" -> "После работ"
            "completion" -> "При завершении"
            else -> "Фото"
        }
    }
}
