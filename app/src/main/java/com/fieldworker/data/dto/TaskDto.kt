package com.fieldworker.data.dto

import com.google.gson.annotations.SerializedName

/**
 * Data Transfer Object для задачи с сервера.
 * Соответствует JSON структуре API.
 */
data class TaskDto(
    @SerializedName("id")
    val id: Long,
    
    @SerializedName("task_number")
    val taskNumber: String?,
    
    @SerializedName("title")
    val title: String,
    
    @SerializedName("raw_address")
    val rawAddress: String?,
    
    @SerializedName("description")
    val description: String?,
    
    @SerializedName("lat")
    val lat: Double?,
    
    @SerializedName("lon")
    val lon: Double?,
    
    @SerializedName("status")
    val status: String,
    
    @SerializedName("priority")
    val priority: Int = 1,
    
    @SerializedName("created_at")
    val createdAt: String?,
    
    @SerializedName("updated_at")
    val updatedAt: String?,
    
    @SerializedName("planned_date")
    val plannedDate: String? = null,
    
    @SerializedName("comments_count")
    val commentsCount: Int = 0
)

/**
 * DTO для обновления статуса задачи с комментарием
 */
data class UpdateStatusDto(
    @SerializedName("status")
    val status: String,
    
    @SerializedName("comment")
    val comment: String = ""
)

/**
 * DTO для обновления планируемой даты выполнения
 */
data class UpdatePlannedDateDto(
    @SerializedName("planned_date")
    val plannedDate: String?
)

/**
 * DTO для комментария
 */
data class CommentDto(
    @SerializedName("id")
    val id: Long,
    
    @SerializedName("task_id")
    val taskId: Long,
    
    @SerializedName("text")
    val text: String,
    
    @SerializedName("author")
    val author: String,
    
    @SerializedName("old_status")
    val oldStatus: String?,
    
    @SerializedName("new_status")
    val newStatus: String?,
    
    @SerializedName("created_at")
    val createdAt: String
)

/**
 * DTO для создания комментария
 */
data class CreateCommentDto(
    @SerializedName("text")
    val text: String,
    
    @SerializedName("author")
    val author: String = "Сотрудник"
)

/**
 * DTO для детальной информации о задаче (с комментариями)
 */
data class TaskDetailDto(
    @SerializedName("id")
    val id: Long,
    
    @SerializedName("task_number")
    val taskNumber: String?,
    
    @SerializedName("title")
    val title: String,
    
    @SerializedName("raw_address")
    val rawAddress: String?,
    
    @SerializedName("description")
    val description: String?,
    
    @SerializedName("lat")
    val lat: Double?,
    
    @SerializedName("lon")
    val lon: Double?,
    
    @SerializedName("status")
    val status: String,
    
    @SerializedName("priority")
    val priority: Int = 1,
    
    @SerializedName("created_at")
    val createdAt: String?,
    
    @SerializedName("updated_at")
    val updatedAt: String?,
    
    @SerializedName("planned_date")
    val plannedDate: String? = null,
    
    @SerializedName("comments")
    val comments: List<CommentDto> = emptyList()
)

/**
 * DTO для настроек отправки отчётов
 */
data class ReportSettingsDto(
    @SerializedName("report_target")
    val reportTarget: String,  // "group", "contact", "none"
    
    @SerializedName("report_contact_phone")
    val reportContactPhone: String?
)

/**
 * DTO для обновления настроек отчётов
 */
data class UpdateReportSettingsDto(
    @SerializedName("report_target")
    val reportTarget: String,
    
    @SerializedName("report_contact_phone")
    val reportContactPhone: String? = null
)

/**
 * DTO для фотографии заявки
 */
data class TaskPhotoDto(
    @SerializedName("id")
    val id: Long,
    
    @SerializedName("task_id")
    val taskId: Long,
    
    @SerializedName("filename")
    val filename: String,
    
    @SerializedName("original_name")
    val originalName: String?,
    
    @SerializedName("file_size")
    val fileSize: Int,
    
    @SerializedName("mime_type")
    val mimeType: String,
    
    @SerializedName("photo_type")
    val photoType: String,  // "before", "after", "completion"
    
    @SerializedName("url")
    val url: String,
    
    @SerializedName("created_at")
    val createdAt: String,
    
    @SerializedName("uploaded_by")
    val uploadedBy: String?
)

/**
 * Generic DTO для пагинации
 */
data class PaginatedResponseDto<T>(
    @SerializedName("items")
    val items: List<T>,
    
    @SerializedName("total")
    val total: Int,
    
    @SerializedName("page")
    val page: Int,
    
    @SerializedName("size")
    val size: Int,
    
    @SerializedName("pages")
    val pages: Int
)
