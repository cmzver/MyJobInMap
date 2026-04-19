package com.fieldworker.next.data.remote.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PortalTaskListItemDto(
    val id: Long,
    @SerialName("task_number") val taskNumber: String? = null,
    val title: String,
    @SerialName("raw_address") val rawAddress: String? = null,
    val description: String? = null,
    @SerialName("customer_name") val customerName: String? = null,
    @SerialName("customer_phone") val customerPhone: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val status: String,
    val priority: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("planned_date") val plannedDate: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("assigned_user_id") val assignedUserId: Long? = null,
    @SerialName("assigned_user_name") val assignedUserName: String? = null,
    @SerialName("is_remote") val isRemote: Boolean = false,
    @SerialName("is_paid") val isPaid: Boolean = false,
    @SerialName("payment_amount") val paymentAmount: Double = 0.0,
    @SerialName("system_id") val systemId: Long? = null,
    @SerialName("system_type") val systemType: String? = null,
    @SerialName("defect_type") val defectType: String? = null,
    @SerialName("organization_id") val organizationId: Long? = null,
    @SerialName("comments_count") val commentsCount: Int = 0,
)

@Serializable
data class PortalTaskDetailDto(
    val id: Long,
    @SerialName("task_number") val taskNumber: String? = null,
    val title: String,
    @SerialName("raw_address") val rawAddress: String? = null,
    val description: String? = null,
    @SerialName("customer_name") val customerName: String? = null,
    @SerialName("customer_phone") val customerPhone: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val status: String,
    val priority: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("planned_date") val plannedDate: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("assigned_user_id") val assignedUserId: Long? = null,
    @SerialName("assigned_user_name") val assignedUserName: String? = null,
    @SerialName("is_remote") val isRemote: Boolean = false,
    @SerialName("is_paid") val isPaid: Boolean = false,
    @SerialName("payment_amount") val paymentAmount: Double = 0.0,
    @SerialName("system_id") val systemId: Long? = null,
    @SerialName("system_type") val systemType: String? = null,
    @SerialName("defect_type") val defectType: String? = null,
    @SerialName("organization_id") val organizationId: Long? = null,
    val comments: List<PortalCommentDto> = emptyList(),
)

@Serializable
data class PortalCommentDto(
    val id: Long,
    @SerialName("task_id") val taskId: Long,
    val text: String,
    val author: String,
    @SerialName("author_id") val authorId: Long? = null,
    @SerialName("old_status") val oldStatus: String? = null,
    @SerialName("new_status") val newStatus: String? = null,
    @SerialName("old_assignee") val oldAssignee: String? = null,
    @SerialName("new_assignee") val newAssignee: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class PortalStatusUpdateRequest(
    val status: String,
    val comment: String = "",
)

@Serializable
data class PortalCreateCommentRequest(
    val text: String,
)

@Serializable
data class PortalPhotoDto(
    val id: Long,
    @SerialName("task_id") val taskId: Long,
    val filename: String,
    val url: String,
    @SerialName("photo_type") val photoType: String = "other",
    @SerialName("created_at") val createdAt: String,
)
