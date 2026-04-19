package com.fieldworker.next.domain.usecase

import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskPhoto
import com.fieldworker.next.domain.repository.TaskRepository

class UploadTaskPhotoUseCase(
    private val repository: TaskRepository,
) {
    suspend operator fun invoke(
        taskId: Long,
        fileName: String,
        fileBytes: ByteArray,
        mimeType: String,
    ): AppResult<TaskPhoto> = repository.uploadPhoto(
        taskId = taskId,
        fileName = fileName,
        fileBytes = fileBytes,
        mimeType = mimeType,
    )
}
