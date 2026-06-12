package com.fieldworker.data.dto

import kotlinx.serialization.Serializable

/**
 * Data Transfer Object для задачи с сервера.
 * Соответствует JSON структуре API.
 */
@Serializable
data class TaskDto(
    val id: Long,
    
    val taskNumber: String?,
    
    val title: String,
    
    val rawAddress: String?,
    
    val description: String?,

    val customerName: String? = null,

    val customerPhone: String? = null,
    
    val lat: Double?,
    
    val lon: Double?,
    
    val status: String,
    
    val priority: String = "PLANNED",
    
    val createdAt: String?,
    
    val updatedAt: String?,
    
    val plannedDate: String? = null,

    val assignedUserId: Long? = null,

    val assignedUserName: String? = null,

    val isRemote: Boolean = false,

    val isPaid: Boolean = false,

    val paymentAmount: Double = 0.0,

    val systemType: String? = null,

    val defectType: String? = null,
    
    val commentsCount: Int = 0
)

/**
 * DTO для обновления статуса задачи с комментарием
 */
@Serializable
data class UpdateStatusDto(
    val status: String,
    
    val comment: String = ""
)

/**
 * DTO для обновления планируемой даты выполнения
 */
@Serializable
data class UpdatePlannedDateDto(
    val plannedDate: String?
)

/**
 * DTO для комментария
 */
@Serializable
data class CommentDto(
    val id: Long,
    
    val taskId: Long,
    
    val text: String,
    
    val author: String,
    
    val oldStatus: String?,
    
    val newStatus: String?,
    
    val createdAt: String
)

/**
 * DTO для создания комментария
 */
@Serializable
data class CreateCommentDto(
    val text: String,
    
    val author: String = "Сотрудник"
)

/**
 * DTO для детальной информации о задаче (с комментариями)
 */
@Serializable
data class TaskDetailDto(
    val id: Long,
    
    val taskNumber: String?,
    
    val title: String,
    
    val rawAddress: String?,
    
    val description: String?,

    val customerName: String? = null,

    val customerPhone: String? = null,
    
    val lat: Double?,
    
    val lon: Double?,
    
    val status: String,
    
    val priority: String = "PLANNED",
    
    val createdAt: String?,
    
    val updatedAt: String?,
    
    val plannedDate: String? = null,

    val assignedUserId: Long? = null,

    val assignedUserName: String? = null,

    val isRemote: Boolean = false,

    val isPaid: Boolean = false,

    val paymentAmount: Double = 0.0,

    val systemType: String? = null,

    val defectType: String? = null,
    
    val comments: List<CommentDto> = emptyList()
)

/**
 * DTO для настроек отправки отчётов
 */
@Serializable
data class ReportSettingsDto(
    val reportTarget: String,  // "group", "contact", "none"
    
    val reportContactPhone: String?
)

/**
 * DTO для обновления настроек отчётов
 */
@Serializable
data class UpdateReportSettingsDto(
    val reportTarget: String,
    
    val reportContactPhone: String? = null
)

/**
 * DTO для фотографии заявки
 */
@Serializable
data class TaskPhotoDto(
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
)

/**
 * Generic DTO для пагинации
 */
@Serializable
data class PaginatedResponseDto<T>(
    val items: List<T>,
    
    val total: Int,
    
    val page: Int,
    
    val size: Int,
    
    val pages: Int
)
