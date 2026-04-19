package com.fieldworker.next.data.remote.api

import com.fieldworker.next.data.remote.model.PortalCommentDto
import com.fieldworker.next.data.remote.model.PortalCreateCommentRequest
import com.fieldworker.next.data.remote.model.PortalPageDto
import com.fieldworker.next.data.remote.model.PortalPhotoDto
import com.fieldworker.next.data.remote.model.PortalStatusUpdateRequest
import com.fieldworker.next.data.remote.model.PortalTaskDetailDto
import com.fieldworker.next.data.remote.model.PortalTaskListItemDto

interface PortalTasksApi {
    suspend fun getTasks(
        accessToken: String,
        page: Int = 1,
        size: Int = 50,
        statuses: List<String> = emptyList(),
    ): PortalPageDto<PortalTaskListItemDto>

    suspend fun getTaskDetail(
        accessToken: String,
        taskId: Long,
    ): PortalTaskDetailDto

    suspend fun updateTaskStatus(
        accessToken: String,
        taskId: Long,
        request: PortalStatusUpdateRequest,
    ): PortalTaskDetailDto

    suspend fun addComment(
        accessToken: String,
        taskId: Long,
        request: PortalCreateCommentRequest,
    ): PortalCommentDto

    suspend fun getPhotos(
        accessToken: String,
        taskId: Long,
    ): List<PortalPhotoDto>

    suspend fun uploadPhoto(
        accessToken: String,
        taskId: Long,
        fileName: String,
        fileBytes: ByteArray,
        mimeType: String,
    ): PortalPhotoDto
}
